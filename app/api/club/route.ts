import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  buildSingleElimination,
  calculateElo,
  resolvePointAward,
  validatePointAdjustment,
} from "../../../lib/business.mjs";

type Row = Record<string, unknown>;
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const memberSchema = z.object({
  name: z.string().trim().min(1).max(40),
  gender: z.enum(["男", "女", "待补充"]),
  major: z.string().trim().min(2).max(80),
  studentId: z.string().regex(/^(?:\d{6,20}|待补充-\d{3,})$/),
  phone: z.string().trim().regex(/^(?:\d{7,20}|待补充-\d{3,})$/),
  school: z.enum(["厦门理工大学", "华夏学院"]).default("厦门理工大学"),
  role: z.enum(["负责人", "社员"]).default("社员"),
  tag: z.string().trim().min(1).max(20).default("新手"),
  status: z.enum(["在社", "暂停活动", "退社", "毕业"]).default("在社"),
});
const tournamentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  game: z.string().trim().min(1).max(30),
  format: z.enum(["单败", "双败"]),
  teamMode: z.literal("单打"),
  bestOf: z
    .number()
    .int()
    .positive()
    .max(15)
    .refine((v) => v % 2 === 1, "局数必须为奇数"),
  handicap: z.string().trim().max(50).default("不让球"),
  startsAt: z.string().min(10),
  location: z.string().trim().max(100).default(""),
  participantIds: z.array(z.string().uuid()).min(2),
  roundBestOf: z.array(z.number().int().min(1).max(15).refine((v) => v % 2 === 1)).min(1).optional(),
  winnerPoints: z.number().int().min(0).max(10000).default(3),
  loserPoints: z.number().int().min(0).max(10000).default(1),
});
const tournamentUpdateSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(2).max(100), game: z.string().trim().min(1).max(30),
  bestOf: z.number().int().min(1).max(15).refine((v) => v % 2 === 1),
  roundBestOf: z.array(z.number().int().min(1).max(15).refine((v) => v % 2 === 1)).min(1),
  handicap: z.string().trim().max(50), startsAt: z.string().min(10), location: z.string().trim().max(100),
  winnerPoints: z.number().int().min(0).max(10000), loserPoints: z.number().int().min(0).max(10000),
});
const challengeSchema = z
  .object({
    challengerId: z.string().uuid(),
    opponentId: z.string().uuid(),
    game: z.string().min(1).max(30),
    bestOf: z
      .number()
      .int()
      .positive()
      .max(21)
      .refine((v) => v % 2 === 1, "局数必须为奇数"),
    handicap: z.string().max(50).default("不让球"),
    playedAt: z.string().min(10),
    location: z.string().max(100).default(""),
    winnerPoints: z.number().int().min(0).max(10000).default(3),
    loserPoints: z.number().int().min(0).max(10000).default(1),
  })
  .refine((v) => v.challengerId !== v.opponentId, "不能向自己发起约战");

function database() {
  if (!env.DB) throw new Error("数据库未配置");
  return env.DB;
}
const schoolModeSchema = z.enum(["厦门理工大学模式", "华夏学院模式", "两校合并模式"]);
async function currentSchoolMode(db: D1Database) {
  const row = await db.prepare("SELECT value FROM app_settings WHERE key='school_mode'").first<{value:string}>();
  return schoolModeSchema.catch("厦门理工大学模式").parse(row?.value);
}
function schoolForMode(mode: string) {
  return mode === "华夏学院模式" ? "华夏学院" : "厦门理工大学";
}
function actor(request: Request) {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (userId)
    return {
      id: userId,
      name:
        request.headers.get("oai-authenticated-user-full-name") ||
        request.headers.get("oai-authenticated-user-email") ||
        "负责人",
      role: "负责人" as const,
    };
  const host = new URL(request.url).hostname;
  if (host === "127.0.0.1" || host === "localhost")
    return { id: "local-manager", name: "本地负责人", role: "负责人" as const };
  throw new Response("请先登录", { status: 401 });
}
function requireManager(request: Request) {
  const user = actor(request);
  if (user.role !== "负责人") throw new Response("无权限", { status: 403 });
  return user;
}
function cleanError(error: unknown) {
  if (error instanceof z.ZodError)
    return json({ error: "输入内容不符合要求", details: error.flatten() }, 422);
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "操作失败";
  if (message.includes("UNIQUE"))
    return json({ error: "学号或记录已存在" }, 409);
  console.error(error);
  return json({ error: "系统暂时无法完成操作" }, 500);
}
function isValidFinalScore(a: number, b: number, bestOf: number) {
  const target = Math.floor(bestOf / 2) + 1;
  return (a === target && b < target) || (b === target && a < target);
}
async function log(
  action: string,
  targetType: string,
  targetId: string,
  detail: string,
  user: { id: string; name: string },
  snapshot?: unknown,
) {
  const db = database();
  const logId = id();
  const statements = [db.prepare(
      "INSERT INTO audit_logs(id,actor_id,actor_name,action,target_type,target_id,detail) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(logId, user.id, user.name, action, targetType, targetId, detail)];
  if (snapshot) statements.push(db.prepare("INSERT INTO undo_snapshots(log_id,snapshot_json) VALUES(?,?)").bind(logId, JSON.stringify(snapshot)));
  await db.batch(statements);
  return logId;
}

export async function GET(request: Request) {
  try {
    requireManager(request);
    const db = database();
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "dashboard";
    const mode = await currentSchoolMode(db);
    const selectedSchool = schoolForMode(mode);
    const combined = mode === "两校合并模式";
    if (view === "settings") return json({ schoolMode: mode });
    if (view === "members") {
      const includeArchived = url.searchParams.get("includeArchived") === "1";
      const { results } = await db
        .prepare(
          `SELECT * FROM members WHERE ${includeArchived ? "1=1" : "deleted_at IS NULL"} AND (?=1 OR school=?) ORDER BY deleted_at IS NOT NULL,created_at DESC`,
        )
        .bind(combined ? 1 : 0, selectedSchool)
        .all();
      return json({ members: results });
    }
    if (view === "member-profile") {
      const memberId = z.string().uuid().parse(url.searchParams.get("memberId"));
      const member = await db.prepare("SELECT * FROM members WHERE id=?").bind(memberId).first();
      if (!member) return json({error:"成员档案不存在"},404);
      const ledger = (await db.prepare("SELECT * FROM score_ledger WHERE member_id=? ORDER BY created_at DESC,rowid DESC").bind(memberId).all()).results;
      return json({member,ledger});
    }
    if (view === "tournaments") {
      const { results } = await db
        .prepare(
          "SELECT t.*, (SELECT COUNT(*) FROM tournament_entries e WHERE e.tournament_id=t.id) participant_count FROM tournaments t WHERE (?=1 OR t.school_scope=?) ORDER BY starts_at DESC",
        )
        .bind(combined ? 1 : 0, selectedSchool)
        .all();
      return json({ tournaments: results });
    }
    if (view === "matches") {
      const tournamentId = url.searchParams.get("tournamentId");
      const { results } = await db
        .prepare(
          "SELECT x.*,m1.name player1_name,m2.name player2_name,r.name referee_name FROM matches x LEFT JOIN members m1 ON m1.id=x.player1_id LEFT JOIN members m2 ON m2.id=x.player2_id LEFT JOIN members r ON r.id=x.referee_id WHERE x.tournament_id=? ORDER BY bracket,round_no,match_no",
        )
        .bind(tournamentId)
        .all();
      return json({ matches: results });
    }
    if (view === "challenges") {
      const { results } = await db
        .prepare(
          "SELECT c.*,a.name challenger_name,b.name opponent_name,w.name winner_name FROM challenges c JOIN members a ON a.id=c.challenger_id JOIN members b ON b.id=c.opponent_id LEFT JOIN members w ON w.id=c.winner_id WHERE (?=1 OR (a.school=? AND b.school=?)) ORDER BY c.created_at DESC",
        )
        .bind(combined ? 1 : 0, selectedSchool, selectedSchool)
        .all();
      return json({ challenges: results });
    }
    if (view === "leaderboard") {
      const { results } = await db
        .prepare(
          "SELECT id,name,major,school,tag,points,elo,wins,losses FROM members WHERE deleted_at IS NULL AND status='在社' AND (?=1 OR school=?) ORDER BY points DESC,elo DESC,name",
        )
        .bind(combined ? 1 : 0, selectedSchool)
        .all();
      return json({ leaderboard: results });
    }
    if (view === "logs") {
      const { results } = await db
        .prepare("SELECT l.*,CASE WHEN u.log_id IS NOT NULL AND u.undone_at IS NULL AND u.log_id=(SELECT log_id FROM undo_snapshots WHERE undone_at IS NULL ORDER BY created_at DESC,rowid DESC LIMIT 1) THEN 1 ELSE 0 END can_undo FROM audit_logs l LEFT JOIN undo_snapshots u ON u.log_id=l.id ORDER BY l.created_at DESC LIMIT 200")
        .all();
      return json({ logs: results });
    }
    if (view === "backup") {
      requireManager(request);
      const tables = [
        "members",
        "tournaments",
        "tournament_entries",
        "matches",
        "challenges",
        "score_ledger",
        "audit_logs",
        "app_settings",
      ];
      const data: Record<string, unknown[]> = {};
      for (const table of tables) {
        data[table] = (await db.prepare(`SELECT * FROM ${table}`).all())
          .results as unknown[];
      }
      return json({ version: 1, exportedAt: now(), data });
    }
    const [memberStats, tournamentStats, challengeStats, leaders, upcoming] =
      await Promise.all([
        db
          .prepare(
            "SELECT COUNT(*) total,SUM(CASE WHEN status='在社' THEN 1 ELSE 0 END) active FROM members WHERE deleted_at IS NULL AND (?=1 OR school=?)",
          )
          .bind(combined ? 1 : 0, selectedSchool)
          .first(),
        db
          .prepare(
            "SELECT COUNT(*) total,SUM(CASE WHEN status IN ('进行中','待签到') THEN 1 ELSE 0 END) active FROM tournaments WHERE (?=1 OR school_scope=?)",
          )
          .bind(combined ? 1 : 0, selectedSchool)
          .first(),
        db
          .prepare(
            "SELECT COUNT(*) total,SUM(CASE WHEN c.status='待负责人审核' THEN 1 ELSE 0 END) pending FROM challenges c JOIN members a ON a.id=c.challenger_id JOIN members b ON b.id=c.opponent_id WHERE (?=1 OR (a.school=? AND b.school=?))",
          )
          .bind(combined ? 1 : 0, selectedSchool, selectedSchool)
          .first(),
        db
          .prepare(
            "SELECT id,name,major,school,points,elo FROM members WHERE deleted_at IS NULL AND (?=1 OR school=?) ORDER BY points DESC,elo DESC LIMIT 5",
          )
          .bind(combined ? 1 : 0, selectedSchool)
          .all(),
        db
          .prepare(
            "SELECT * FROM tournaments WHERE starts_at>=datetime('now') AND (?=1 OR school_scope=?) ORDER BY starts_at LIMIT 5",
          )
          .bind(combined ? 1 : 0, selectedSchool)
          .all(),
      ]);
    return json({
      stats: {
        members: Number(memberStats?.total || 0),
        activeMembers: Number(memberStats?.active || 0),
        tournaments: Number(tournamentStats?.total || 0),
        activeTournaments: Number(tournamentStats?.active || 0),
        challenges: Number(challengeStats?.total || 0),
        pendingChallenges: Number(challengeStats?.pending || 0),
      },
      leaders: leaders.results,
      upcoming: upcoming.results,
    });
  } catch (error) {
    return cleanError(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = database();
    const body = (await request.json()) as {
      action?: string;
      payload?: unknown;
    };
    let action = body.action || "";
    const payload = body.payload as Row;
    const user = requireManager(request);
    if (action === "settings.schoolMode") {
      const mode = schoolModeSchema.parse(payload.mode);
      await db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('school_mode',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(mode).run();
      await log("切换学校模式", "system", "school_mode", `切换为${mode}`, user);
      return json({ok:true,schoolMode:mode});
    }
    if (action === "operation.undo") {
      const logId = z.string().uuid().parse(payload.logId);
      const latest = await db.prepare("SELECT log_id,snapshot_json FROM undo_snapshots WHERE undone_at IS NULL ORDER BY created_at DESC,rowid DESC LIMIT 1").first<{log_id:string;snapshot_json:string}>();
      if (!latest || latest.log_id !== logId) return json({error:"只能从最新一条可撤回操作开始撤回"},409);
      const lock = await db.prepare("UPDATE undo_snapshots SET undone_at=CURRENT_TIMESTAMP WHERE log_id=? AND undone_at IS NULL").bind(logId).run();
      if (!lock.meta.changes) return json({error:"该操作已经撤回"},409);
      try {
        await restoreBackup(db, JSON.parse(latest.snapshot_json), true);
      } catch (error) {
        await db.prepare("UPDATE undo_snapshots SET undone_at=NULL WHERE log_id=?").bind(logId).run();
        throw error;
      }
      await log("撤回操作", "audit_log", logId, "已恢复到该操作执行前的数据状态", user);
      return json({ok:true});
    }
    const undoSnapshot = await createBackup(db);
    if (action === "member.create") {
      const data = memberSchema.parse(payload);
      const memberId = id();
      await db
        .prepare(
          "INSERT INTO members(id,name,gender,major,student_id,phone,school,role,tag,status) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          memberId,
          data.name,
          data.gender,
          data.major,
          data.studentId,
          data.phone,
          data.school,
          data.role,
          data.tag,
          data.status,
        )
        .run();
      await log("新增成员", "member", memberId, `新增成员：${data.name}`, user, undoSnapshot);
      return json({ id: memberId }, 201);
    }
    if (action === "member.update") {
      const memberId = z.string().uuid().parse(payload.id);
      const data = memberSchema.parse(payload);
      await db
        .prepare(
          "UPDATE members SET name=?,gender=?,major=?,student_id=?,phone=?,school=?,role=?,tag=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL",
        )
        .bind(
          data.name,
          data.gender,
          data.major,
          data.studentId,
          data.phone,
          data.school,
          data.role,
          data.tag,
          data.status,
          memberId,
        )
        .run();
      await log("修改成员", "member", memberId, `修改成员：${data.name}`, user, undoSnapshot);
      return json({ ok: true });
    }
    if (action === "member.delete") {
      const memberId = z.string().uuid().parse(payload.id);
      const member = await db
        .prepare("SELECT name FROM members WHERE id=? AND deleted_at IS NULL")
        .bind(memberId)
        .first<{ name: string }>();
      if (!member) return json({ error: "成员不存在" }, 404);
      await db.prepare("UPDATE members SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL").bind(memberId).run();
      await log(
        "删除成员",
        "member",
        memberId,
        `归档成员：${member.name}（档案与积分流水保留）`,
        user,
        undoSnapshot,
      );
      return json({ ok: true });
    }
    if (action === "member.restore") {
      const memberId = z.string().uuid().parse(payload.id);
      const result = await db.prepare("UPDATE members SET deleted_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NOT NULL").bind(memberId).run();
      if (!result.meta.changes) return json({error:"成员未归档或不存在"},404);
      await log("恢复成员", "member", memberId, "恢复已归档成员", user, undoSnapshot);
      return json({ok:true});
    }
    if (action === "member.points.adjust") {
      const memberId = z.string().uuid().parse(payload.id);
      const delta = validatePointAdjustment(z.number().int().parse(payload.delta));
      const reason = z.string().trim().min(2).max(200).parse(payload.reason);
      const occurredAt = z.string().datetime().parse(payload.occurredAt);
      const member = await db.prepare("SELECT name FROM members WHERE id=?").bind(memberId).first<{name:string}>();
      if (!member) return json({error:"成员档案不存在"},404);
      const ledgerId = id();
      await db.batch([
        db.prepare("UPDATE members SET points=points+?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(delta,memberId),
        db.prepare("INSERT INTO score_ledger(id,member_id,source_type,source_id,points_delta,elo_delta,reason,operator_name,created_at) VALUES(?,?,?,?,?,0,?,?,?)").bind(ledgerId,memberId,"手动调整",ledgerId,delta,reason,user.name,occurredAt),
      ]);
      await log("手动调整积分", "member", memberId, `${member.name} ${delta > 0 ? "+" : ""}${delta} 分：${reason}`, user, undoSnapshot);
      return json({ok:true});
    }
    if (action === "members.import") {
      const rows = z.array(memberSchema).max(1000).parse(payload.rows);
      let created = 0,
        updated = 0;
      for (const data of rows) {
        const existing = await db
          .prepare("SELECT id FROM members WHERE student_id=?")
          .bind(data.studentId)
          .first<{ id: string }>();
        if (existing) {
          await db
            .prepare(
              "UPDATE members SET name=?,gender=?,major=?,phone=?,school=?,role=?,tag=?,status=?,deleted_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            )
            .bind(
              data.name,
              data.gender,
              data.major,
              data.phone,
              data.school,
              data.role,
              data.tag,
              data.status,
              existing.id,
            )
            .run();
          updated++;
        } else {
          await db
            .prepare(
              "INSERT INTO members(id,name,gender,major,student_id,phone,school,role,tag,status) VALUES(?,?,?,?,?,?,?,?,?,?)",
            )
            .bind(
              id(),
              data.name,
              data.gender,
              data.major,
              data.studentId,
              data.phone,
              data.school,
              data.role,
              data.tag,
              data.status,
            )
            .run();
          created++;
        }
      }
      await log(
        "批量导入",
        "member",
        "batch",
        `新增 ${created} 人，更新 ${updated} 人`,
        user,
        undoSnapshot,
      );
      return json({ created, updated });
    }
    if (action === "tournament.create") {
      const data = tournamentSchema.parse(payload);
      const pointAward = resolvePointAward(data);
      const mode = await currentSchoolMode(db);
      const tournamentId = id();
      const statements = [
        db
          .prepare(
            "INSERT INTO tournaments(id,name,game,format,team_mode,best_of,round_best_of,handicap,starts_at,location,school_scope,winner_points,loser_points) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          )
          .bind(
            tournamentId,
            data.name,
            data.game,
            data.format,
            data.teamMode,
            data.bestOf,
            JSON.stringify(data.roundBestOf || [data.bestOf]),
            data.handicap,
            data.startsAt,
            data.location,
            mode === "两校合并模式" ? "两校合并" : schoolForMode(mode),
            pointAward.winner,
            pointAward.loser,
          ),
        ...data.participantIds.map((memberId, index) =>
          db
            .prepare(
              "INSERT INTO tournament_entries(id,tournament_id,member_id,seed) VALUES(?,?,?,?)",
            )
            .bind(id(), tournamentId, memberId, index < 2 ? index + 1 : 0),
        ),
      ];
      await db.batch(statements);
      await log(
        "创建比赛",
        "tournament",
        tournamentId,
        `创建比赛：${data.name}`,
        user,
        undoSnapshot,
      );
      return json({ id: tournamentId }, 201);
    }
    if (action === "tournament.update") {
      const data = tournamentUpdateSchema.parse(payload);
      const pointAward = resolvePointAward(data);
      const result = await db.prepare("UPDATE tournaments SET name=?,game=?,best_of=?,round_best_of=?,handicap=?,starts_at=?,location=?,winner_points=?,loser_points=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(data.name,data.game,data.bestOf,JSON.stringify(data.roundBestOf),data.handicap,data.startsAt,data.location,pointAward.winner,pointAward.loser,data.id).run();
      if (!result.meta.changes) return json({error:"比赛不存在"},404);
      for (let round = 0; round < data.roundBestOf.length; round++) await db.prepare("UPDATE matches SET best_of=? WHERE tournament_id=? AND round_no=? AND status!='已结束'").bind(data.roundBestOf[round],data.id,round+1).run();
      await log("修改比赛", "tournament", data.id, `修改比赛：${data.name}`, user, undoSnapshot);
      return json({ok:true});
    }
    if (action === "tournament.delete") {
      const tournamentId = z.string().uuid().parse(payload.id);
      const tournament = await db.prepare("SELECT name FROM tournaments WHERE id=?").bind(tournamentId).first<{name:string}>();
      if (!tournament) return json({error:"比赛不存在"},404);
      const ledger = (await db.prepare("SELECT l.*,m.winner_id FROM score_ledger l JOIN matches m ON m.id=l.source_id WHERE m.tournament_id=? AND l.source_type='正式比赛'").bind(tournamentId).all<Row>()).results;
      const statements = ledger.map((entry) => db.prepare("UPDATE members SET points=points-?,elo=elo-?,wins=MAX(0,wins-?),losses=MAX(0,losses-?) WHERE id=?").bind(Number(entry.points_delta),Number(entry.elo_delta),entry.member_id===entry.winner_id?1:0,entry.member_id===entry.winner_id?0:1,entry.member_id));
      statements.push(db.prepare("UPDATE score_ledger SET source_id=source_id||':reversed:'||id,reversed_at=CURRENT_TIMESTAMP WHERE source_type='正式比赛' AND source_id IN (SELECT id FROM matches WHERE tournament_id=?) AND reversed_at IS NULL").bind(tournamentId),db.prepare("DELETE FROM matches WHERE tournament_id=?").bind(tournamentId),db.prepare("DELETE FROM tournament_entries WHERE tournament_id=?").bind(tournamentId),db.prepare("DELETE FROM tournaments WHERE id=?").bind(tournamentId));
      await db.batch(statements);
      await log("删除比赛", "tournament", tournamentId, `删除比赛：${tournament.name}`, user, undoSnapshot);
      return json({ok:true});
    }
    if (action === "tournament.checkin") {
      const tournamentId = z.string().uuid().parse(payload.tournamentId);
      const memberId = z.string().uuid().parse(payload.memberId);
      await db
        .prepare(
          "UPDATE tournament_entries SET checked_in=? WHERE tournament_id=? AND member_id=?",
        )
        .bind(payload.checkedIn ? 1 : 0, tournamentId, memberId)
        .run();
      await log(payload.checkedIn ? "赛事签到" : "取消签到", "tournament", tournamentId, `成员签到状态已更新`, user, undoSnapshot);
      return json({ ok: true });
    }
    if (action === "tournament.generate") {
      const tournamentId = z.string().uuid().parse(payload.tournamentId);
      const tournament = await db
        .prepare("SELECT * FROM tournaments WHERE id=?")
        .bind(tournamentId)
        .first<Row>();
      if (!tournament) return json({ error: "比赛不存在" }, 404);
      const entries = (
        await db
          .prepare(
            "SELECT member_id FROM tournament_entries WHERE tournament_id=? AND checked_in=1 ORDER BY seed DESC,id",
          )
          .bind(tournamentId)
          .all()
      ).results as { member_id: string }[];
      if (entries.length < 2)
        return json({ error: "至少需要两名已签到选手" }, 422);
      const scored = await db
        .prepare("SELECT COUNT(*) count FROM score_ledger l JOIN matches m ON m.id=l.source_id WHERE m.tournament_id=? AND l.source_type='正式比赛'")
        .bind(tournamentId)
        .first<{ count: number }>();
      if (Number(scored?.count || 0) > 0)
        return json({ error: "比赛已有计分记录，不能重置签表" }, 409);
      const bracket = buildSingleElimination(entries.map((e) => e.member_id));
      const rounds = Math.log2(bracket.size);
      const roundRules = JSON.parse(String(tournament.round_best_of || "[]")) as number[];
      const matchIds: string[][] = [];
      for (let round = 1; round <= rounds; round++) {
        matchIds[round] = Array.from(
          { length: bracket.size / 2 ** round },
          () => id(),
        );
      }
      const statements = [
        db.prepare("DELETE FROM matches WHERE tournament_id=?").bind(tournamentId),
      ];
      for (let round = rounds; round >= 1; round--) {
        for (let index = 0; index < matchIds[round].length; index++) {
          const first = round === 1 ? bracket.matches[index]?.home : null;
          const second = round === 1 ? bracket.matches[index]?.away : null;
          statements.push(
            db
              .prepare(
                "INSERT INTO matches(id,tournament_id,bracket,round_no,match_no,best_of,player1_id,player2_id,next_match_id,next_slot,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
              )
              .bind(
                matchIds[round][index],
                tournamentId,
                "胜者组",
                round,
                index + 1,
                roundRules[round - 1] || Number(tournament.best_of),
                first,
                second,
                round < rounds
                  ? matchIds[round + 1][Math.floor(index / 2)]
                  : null,
                round < rounds ? (index % 2) + 1 : null,
                first && !second ? "已结束" : "待开始",
              ),
          );
        }
      }
      statements.push(
        db
          .prepare(
            "UPDATE tournaments SET status='进行中',updated_at=CURRENT_TIMESTAMP WHERE id=?",
          )
          .bind(tournamentId),
      );
      await db.batch(statements);
      for (let i = 0; i < bracket.matches.length; i++) {
        const m = bracket.matches[i];
        if (m.home && !m.away && rounds > 1) {
          await advanceWinner(db, matchIds[1][i], m.home, 0, 0);
        }
      }
      await log(
        "生成签表",
        "tournament",
        tournamentId,
        `生成 ${tournament.format} 签表`,
        user,
        undoSnapshot,
      );
      return json({ ok: true });
    }
    if (action === "match.result.update") {
      const matchId = z.string().uuid().parse(payload.matchId);
      const old = await db.prepare("SELECT x.*,t.format,t.winner_points,t.loser_points FROM matches x JOIN tournaments t ON t.id=x.tournament_id WHERE x.id=? AND x.status='已结束'").bind(matchId).first<Row>();
      if (!old) return json({error:"该场比赛还没有可修改的结果"},409);
      const proposed1=z.number().int().min(0).parse(payload.player1Score),proposed2=z.number().int().min(0).parse(payload.player2Score);
      if (!old.player1_id||!old.player2_id||!isValidFinalScore(proposed1,proposed2,Number(old.best_of))) return json({error:`比分不符合 ${old.best_of} 局制`},422);
      if (old.format === "双败") return json({error:"双败比分请通过操作日志倒序撤回后重新录入"},409);
      if (old.next_match_id) {
        const next = await db.prepare("SELECT status FROM matches WHERE id=?").bind(old.next_match_id).first<{status:string}>();
        if (next?.status === "已结束") return json({error:"下游场次已经结束，请先撤回下游比分"},409);
      }
      const ledger = (await db.prepare("SELECT * FROM score_ledger WHERE source_type='正式比赛' AND source_id=?").bind(matchId).all<Row>()).results;
      const statements = ledger.map((entry) => db.prepare("UPDATE members SET points=points-?,elo=elo-?,wins=MAX(0,wins-?),losses=MAX(0,losses-?) WHERE id=?").bind(Number(entry.points_delta),Number(entry.elo_delta),entry.member_id===old.winner_id?1:0,entry.member_id===old.winner_id?0:1,entry.member_id));
      statements.push(db.prepare("UPDATE score_ledger SET source_id=source_id||':reversed:'||id,reversed_at=CURRENT_TIMESTAMP WHERE source_type='正式比赛' AND source_id=? AND reversed_at IS NULL").bind(matchId),db.prepare("UPDATE tournament_entries SET losses=MAX(0,losses-1),eliminated=0 WHERE tournament_id=? AND member_id=?").bind(old.tournament_id,old.winner_id===old.player1_id?old.player2_id:old.player1_id),db.prepare("UPDATE matches SET player1_score=NULL,player2_score=NULL,winner_id=NULL,status='待开始' WHERE id=?").bind(matchId));
      if (old.next_match_id) statements.push(db.prepare(`UPDATE matches SET ${Number(old.next_slot)===2?"player2_id":"player1_id"}=NULL WHERE id=?`).bind(old.next_match_id));
      await db.batch(statements);
      action = "match.result";
    }
    if (action === "match.result") {
      const matchId = z.string().uuid().parse(payload.matchId);
      const s1 = z.number().int().min(0).parse(payload.player1Score),
        s2 = z.number().int().min(0).parse(payload.player2Score);
      if (s1 === s2) return json({ error: "淘汰赛比分不能相同" }, 422);
      const match = await db
        .prepare(
          "SELECT x.*,t.format,t.winner_points,t.loser_points FROM matches x JOIN tournaments t ON t.id=x.tournament_id WHERE x.id=?",
        )
        .bind(matchId)
        .first<Row>();
      if (!match || !match.player1_id || !match.player2_id)
        return json({ error: "对阵尚未完整" }, 422);
      if (match.status === "已结束")
        return json({ error: "该场比赛已经录入结果" }, 409);
      if (!isValidFinalScore(s1, s2, Number(match.best_of)))
        return json({ error: `比分不符合 ${match.best_of} 局制` }, 422);
      const winner =
        s1 > s2 ? String(match.player1_id) : String(match.player2_id);
      const loser =
        s1 > s2 ? String(match.player2_id) : String(match.player1_id);
      try {
        await db.batch([
          db.prepare("UPDATE matches SET player1_score=?,player2_score=?,winner_id=?,status='已结束' WHERE id=?").bind(s1, s2, winner, matchId),
          db.prepare("UPDATE members SET wins=wins+1 WHERE id=?").bind(winner),
          db.prepare("UPDATE members SET losses=losses+1 WHERE id=?").bind(loser),
          db.prepare("UPDATE tournament_entries SET losses=losses+1,eliminated=CASE WHEN ?='单败' OR losses>=1 THEN 1 ELSE 0 END WHERE tournament_id=? AND member_id=?").bind(match.format, match.tournament_id, loser),
        ]);
        await awardOfficialMatch(db, matchId, winner, loser, Number(match.winner_points), Number(match.loser_points), user.name);
        await manageDoubleElimination(db, match, winner, loser);
        await advanceWinner(db, matchId, winner, s1, s2);
        await log("录入比分", "match", matchId, `比分 ${s1}:${s2}`, user, undoSnapshot);
      } catch (error) {
        await restoreBackup(db, undoSnapshot);
        throw error;
      }
      return json({ ok: true, winnerId: winner });
    }
    if (action === "challenge.create") {
      const data = challengeSchema.parse(payload);
      const pointAward = resolvePointAward(data);
      const challengeId = id();
      await db
        .prepare(
          "INSERT INTO challenges(id,challenger_id,opponent_id,game,best_of,handicap,played_at,location,winner_points,loser_points) VALUES(?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          challengeId,
          data.challengerId,
          data.opponentId,
          data.game,
          data.bestOf,
          data.handicap,
          data.playedAt,
          data.location,
          pointAward.winner,
          pointAward.loser,
        )
        .run();
      await log("发起约战", "challenge", challengeId, "创建社员约战", user, undoSnapshot);
      return json({ id: challengeId }, 201);
    }
    if (action === "challenge.accept") {
      const challengeId = z.string().uuid().parse(payload.id);
      const result = await db
        .prepare(
          "UPDATE challenges SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='待对手接受'",
        )
        .bind(payload.accept ? "待比赛" : "已拒绝", challengeId)
        .run();
      if (!result.meta.changes) return json({ error: "约战状态已变化" }, 409);
      await log(payload.accept ? "接受约战" : "拒绝约战", "challenge", challengeId, payload.accept ? "对手已接受约战" : "对手已拒绝约战", user, undoSnapshot);
      return json({ ok: true });
    }
    if (action === "challenge.submit") {
      const challengeId = z.string().uuid().parse(payload.id);
      const a = z.number().int().min(0).parse(payload.challengerScore),
        b = z.number().int().min(0).parse(payload.opponentScore);
      if (a === b) return json({ error: "比分不能相同" }, 422);
      const c = await db
        .prepare("SELECT challenger_id,opponent_id,best_of,status FROM challenges WHERE id=?")
        .bind(challengeId)
        .first<Row>();
      if (!c) return json({ error: "约战不存在" }, 404);
      if (c.status !== "待比赛") return json({ error: "当前状态不能提交比分" }, 409);
      if (!isValidFinalScore(a, b, Number(c.best_of)))
        return json({ error: `比分不符合 ${c.best_of} 局制` }, 422);
      const winner = a > b ? c.challenger_id : c.opponent_id;
      await db
        .prepare(
          "UPDATE challenges SET challenger_score=?,opponent_score=?,winner_id=?,challenger_confirmed=1,opponent_confirmed=0,status='待对手确认',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='待比赛'",
        )
        .bind(a, b, winner, challengeId)
        .run();
      await log("提交约战比分", "challenge", challengeId, `提交比分 ${a}:${b}`, user, undoSnapshot);
      return json({ ok: true });
    }
    if (action === "challenge.confirm") {
      const challengeId = z.string().uuid().parse(payload.id);
      const result = await db
        .prepare(
          "UPDATE challenges SET opponent_confirmed=1,status='待负责人审核',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='待对手确认'",
        )
        .bind(challengeId)
        .run();
      if (!result.meta.changes) return json({ error: "约战状态已变化" }, 409);
      await log("确认约战比分", "challenge", challengeId, "对手已确认比赛结果", user, undoSnapshot);
      return json({ ok: true });
    }
    if (action === "challenge.approve") {
      const challengeId = z.string().uuid().parse(payload.id);
      const c = await db
        .prepare(
          "SELECT * FROM challenges WHERE id=? AND status='待负责人审核' AND challenger_confirmed=1 AND opponent_confirmed=1",
        )
        .bind(challengeId)
        .first<Row>();
      if (!c) return json({ error: "约战尚未完成双方确认或已审核" }, 409);
      const winner = String(c.winner_id),
        loser =
          winner === c.challenger_id
            ? String(c.opponent_id)
            : String(c.challenger_id);
      const ratings = await db
        .prepare("SELECT id,elo FROM members WHERE id IN (?,?)")
        .bind(winner, loser)
        .all<{ id: string; elo: number }>();
      const wm = ratings.results.find((m) => m.id === winner),
        lm = ratings.results.find((m) => m.id === loser);
      if (!wm || !lm) return json({ error: "成员数据不存在" }, 404);
      const elo = calculateElo(wm.elo, lm.elo, 1);
      const points = resolvePointAward({winnerPoints:Number(c.winner_points),loserPoints:Number(c.loser_points)});
      const batch = [
        db
          .prepare(
            "UPDATE challenges SET status='审核通过',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='待负责人审核'",
          )
          .bind(user.id, challengeId),
        db
          .prepare(
            "UPDATE members SET points=points+?,elo=?,wins=wins+1 WHERE id=?",
          )
          .bind(points.winner, elo.winner, winner),
        db
          .prepare(
            "UPDATE members SET points=points+?,elo=?,losses=losses+1 WHERE id=?",
          )
          .bind(points.loser, elo.loser, loser),
        db
          .prepare(
            "INSERT INTO score_ledger(id,member_id,source_type,source_id,points_delta,elo_delta,reason,operator_name) VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(id(), winner, "约战", challengeId, points.winner, elo.delta, "约战获胜", user.name),
        db
          .prepare(
            "INSERT INTO score_ledger(id,member_id,source_type,source_id,points_delta,elo_delta,reason,operator_name) VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(id(), loser, "约战", challengeId, points.loser, -elo.delta, "完成约战", user.name),
      ];
      await db.batch(batch);
      await log(
        "审核约战",
        "challenge",
        challengeId,
        "双方确认后审核通过并计分",
        user,
        undoSnapshot,
      );
      return json({ ok: true });
    }
    if (action === "backup.restore") {
      await restoreBackup(db, payload.backup);
      await log("恢复备份", "system", "backup", "从备份文件恢复全部数据", user, undoSnapshot);
      return json({ ok: true });
    }
    return json({ error: "未知操作" }, 400);
  } catch (error) {
    return cleanError(error);
  }
}

async function awardOfficialMatch(
  db: D1Database,
  matchId: string,
  winnerId: string,
  loserId: string,
  winnerPoints: number,
  loserPoints: number,
  operatorName: string,
) {
  const ratings = await db
    .prepare("SELECT id,elo FROM members WHERE id IN (?,?)")
    .bind(winnerId, loserId)
    .all<{ id: string; elo: number }>();
  const winner = ratings.results.find((row) => row.id === winnerId),
    loser = ratings.results.find((row) => row.id === loserId);
  if (!winner || !loser) throw new Error("选手数据不存在");
  const points = resolvePointAward({winnerPoints,loserPoints});
  const elo = calculateElo(winner.elo, loser.elo, 1);
  await db.batch([
    db
      .prepare("UPDATE members SET points=points+?,elo=? WHERE id=?")
      .bind(points.winner, elo.winner, winnerId),
    db
      .prepare("UPDATE members SET points=points+?,elo=? WHERE id=?")
      .bind(points.loser, elo.loser, loserId),
    db
      .prepare(
        "INSERT INTO score_ledger(id,member_id,source_type,source_id,points_delta,elo_delta,reason,operator_name) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(id(), winnerId, "正式比赛", matchId, points.winner, elo.delta, "正式比赛获胜", operatorName),
    db
      .prepare(
        "INSERT INTO score_ledger(id,member_id,source_type,source_id,points_delta,elo_delta,reason,operator_name) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(id(), loserId, "正式比赛", matchId, points.loser, -elo.delta, "完成正式比赛", operatorName),
  ]);
}

async function manageDoubleElimination(
  db: D1Database,
  match: Row,
  winnerId: string,
  loserId: string,
) {
  if (match.format !== "双败" || match.bracket === "总决赛") return;
  const tournamentId = String(match.tournament_id);
  const tournament = await db.prepare("SELECT best_of,round_best_of FROM tournaments WHERE id=?").bind(tournamentId).first<{best_of:number;round_best_of:string}>();
  const rules = (()=>{try{return JSON.parse(tournament?.round_best_of||"[]") as number[]}catch{return []}})();
  const ruleFor = (round:number) => rules[Math.min(Math.max(round-1,0),Math.max(rules.length-1,0))] || tournament?.best_of || 3;
  const entrant = match.bracket === "胜者组" ? loserId : winnerId;
  const waiting = await db
    .prepare(
      "SELECT id FROM matches WHERE tournament_id=? AND bracket='败者组' AND status='待开始' AND player1_id IS NOT NULL AND player2_id IS NULL ORDER BY round_no DESC LIMIT 1",
    )
    .bind(tournamentId)
    .first<{ id: string }>();
  if (waiting) {
    await db
      .prepare("UPDATE matches SET player2_id=? WHERE id=?")
      .bind(entrant, waiting.id)
      .run();
  } else {
    const round = await db
      .prepare(
        "SELECT COALESCE(MAX(round_no),0)+1 next_round FROM matches WHERE tournament_id=? AND bracket='败者组'",
      )
      .bind(tournamentId)
      .first<{ next_round: number }>();
    await db
      .prepare(
        "INSERT INTO matches(id,tournament_id,bracket,round_no,match_no,best_of,player1_id,status) VALUES(?,?,?,?,1,?,?,'待开始')",
      )
      .bind(id(), tournamentId, "败者组", round?.next_round || 1, ruleFor(round?.next_round || 1), entrant)
      .run();
  }
  const unfinishedUpper = await db
    .prepare(
      "SELECT COUNT(*) count FROM matches WHERE tournament_id=? AND bracket='胜者组' AND status!='已结束'",
    )
    .bind(tournamentId)
    .first<{ count: number }>();
  if (Number(unfinishedUpper?.count || 0) > 0) return;
  const readyLoser = await db
    .prepare(
      "SELECT id,player1_id FROM matches WHERE tournament_id=? AND bracket='败者组' AND status='待开始' AND player1_id IS NOT NULL AND player2_id IS NULL ORDER BY round_no DESC LIMIT 1",
    )
    .bind(tournamentId)
    .first<{ id: string; player1_id: string }>();
  if (!readyLoser) return;
  const champion = await db
    .prepare(
      "SELECT winner_id FROM matches WHERE tournament_id=? AND bracket='胜者组' AND next_match_id IS NULL AND status='已结束' ORDER BY round_no DESC LIMIT 1",
    )
    .bind(tournamentId)
    .first<{ winner_id: string }>();
  if (!champion?.winner_id) return;
  const existingFinal = await db
    .prepare(
      "SELECT id FROM matches WHERE tournament_id=? AND bracket='总决赛'",
    )
    .bind(tournamentId)
    .first();
  if (existingFinal) return;
  await db.batch([
    db.prepare("DELETE FROM matches WHERE id=?").bind(readyLoser.id),
    db
      .prepare(
        "INSERT INTO matches(id,tournament_id,bracket,round_no,match_no,best_of,player1_id,player2_id,status) VALUES(?,?, '总决赛',1,1,?,?,?,'待开始')",
      )
      .bind(id(), tournamentId, ruleFor(rules.length || 1), champion.winner_id, readyLoser.player1_id),
  ]);
}

async function restoreBackup(db: D1Database, value: unknown, preserveAudit = false) {
  const backup = z
    .object({
      version: z.literal(1),
      data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
    })
    .parse(value);
  const requiredTables = ["members","tournaments","tournament_entries","matches","challenges","score_ledger","audit_logs","app_settings"];
  if (requiredTables.some((table) => !Array.isArray(backup.data[table]))) throw new Error("备份文件缺少必要数据表");
  const columns: Record<string, string[]> = {
    members: [
      "id",
      "name",
      "gender",
      "major",
      "student_id",
      "phone",
      "school",
      "role",
      "tag",
      "status",
      "points",
      "elo",
      "wins",
      "losses",
      "deleted_at",
      "created_at",
      "updated_at",
    ],
    tournaments: [
      "id",
      "name",
      "game",
      "format",
      "team_mode",
      "best_of",
      "round_best_of",
      "handicap",
      "starts_at",
      "location",
      "school_scope",
      "winner_points",
      "loser_points",
      "status",
      "created_at",
      "updated_at",
    ],
    tournament_entries: [
      "id",
      "tournament_id",
      "member_id",
      "team_name",
      "seed",
      "checked_in",
      "eliminated",
      "losses",
    ],
    matches: [
      "id",
      "tournament_id",
      "bracket",
      "round_no",
      "match_no",
      "best_of",
      "player1_id",
      "player2_id",
      "player1_score",
      "player2_score",
      "winner_id",
      "referee_id",
      "table_no",
      "scheduled_at",
      "status",
      "next_match_id",
      "next_slot",
      "created_at",
    ],
    challenges: [
      "id",
      "challenger_id",
      "opponent_id",
      "game",
      "best_of",
      "handicap",
      "played_at",
      "location",
      "winner_points",
      "loser_points",
      "challenger_score",
      "opponent_score",
      "winner_id",
      "challenger_confirmed",
      "opponent_confirmed",
      "status",
      "reviewed_by",
      "reviewed_at",
      "created_at",
      "updated_at",
    ],
    score_ledger: [
      "id",
      "member_id",
      "source_type",
      "source_id",
      "points_delta",
      "elo_delta",
      "reason",
      "operator_name",
      "reversed_at",
      "created_at",
    ],
    audit_logs: [
      "id",
      "actor_id",
      "actor_name",
      "action",
      "target_type",
      "target_id",
      "detail",
      "created_at",
    ],
    app_settings: ["key", "value", "updated_at"],
  };
  const insertOrder = [
    "members",
    "tournaments",
    "tournament_entries",
    "matches",
    "challenges",
    "score_ledger",
    "audit_logs",
    "app_settings",
  ].filter((table) => !(preserveAudit && table === "audit_logs"));
  const total = insertOrder.reduce(
    (sum, table) => sum + (backup.data[table]?.length || 0),
    0,
  );
  if (total > 10000) throw new Error("备份记录过多");
  const legacyDefaults: Record<string, unknown> = {
    school: "厦门理工大学",
    school_scope: "厦门理工大学",
    winner_points: 3,
    loser_points: 1,
    operator_name: "系统",
  };
  const statements = [
    ...insertOrder
      .slice()
      .reverse()
      .map((table) => db.prepare(`DELETE FROM ${table}`)),
  ];
  for (const table of insertOrder) {
    const tableColumns = columns[table];
    for (const row of backup.data[table] || []) {
      const placeholders = tableColumns.map(() => "?").join(",");
      statements.push(
        db
          .prepare(
            `INSERT INTO ${table}(${tableColumns.join(",")}) VALUES(${placeholders})`,
          )
          .bind(...tableColumns.map((column) => row[column] ?? legacyDefaults[column] ?? null)),
      );
    }
  }
  await db.batch(statements);
}

async function createBackup(db: D1Database) {
  const tables = ["members", "tournaments", "tournament_entries", "matches", "challenges", "score_ledger", "audit_logs", "app_settings"];
  const data: Record<string, unknown[]> = {};
  for (const table of tables) data[table] = (await db.prepare(`SELECT * FROM ${table}`).all()).results as unknown[];
  return { version: 1 as const, exportedAt: now(), data };
}

async function advanceWinner(
  db: D1Database,
  matchId: string,
  winnerId: string,
  ...scores: number[]
) {
  void scores;
  const match = await db
    .prepare("SELECT next_match_id,next_slot FROM matches WHERE id=?")
    .bind(matchId)
    .first<{ next_match_id: string | null; next_slot: number | null }>();
  if (!match?.next_match_id) return;
  const column = match.next_slot === 2 ? "player2_id" : "player1_id";
  await db
    .prepare(`UPDATE matches SET ${column}=? WHERE id=?`)
    .bind(winnerId, match.next_match_id)
    .run();
}
