"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Award,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Download,
  History,
  LayoutDashboard,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Swords,
  Trash2,
  Trophy,
  Upload,
  UsersRound,
  X,
} from "lucide-react";

type NavKey =
  | "概览"
  | "成员管理"
  | "正式比赛"
  | "社员约战"
  | "积分排名"
  | "数据分析"
  | "操作日志";
type Member = {
  id: string;
  name: string;
  gender: "男" | "女" | "待补充";
  major: string;
  student_id: string;
  phone: string;
  school: "厦门理工大学" | "华夏学院";
  role: "负责人" | "社员";
  tag: string;
  status: string;
  points: number;
  elo: number;
  wins: number;
  losses: number;
  deleted_at: string | null;
};
type Tournament = {
  id: string;
  name: string;
  game: string;
  format: "单败" | "双败";
  team_mode: string;
  best_of: number;
  round_best_of: string;
  handicap: string;
  starts_at: string;
  location: string;
  status: string;
  participant_count: number;
  winner_points: number;
  loser_points: number;
};
type Match = {
  id: string;
  tournament_id: string;
  bracket: string;
  round_no: number;
  match_no: number;
  best_of: number;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  player1_score: number | null;
  player2_score: number | null;
  winner_id: string | null;
  status: string;
};
type LedgerEntry = { id:string; source_type:string; points_delta:number; elo_delta:number; reason:string; operator_name:string; reversed_at:string|null; created_at:string };
type Challenge = {
  id: string;
  challenger_name: string;
  opponent_name: string;
  challenger_score: number | null;
  opponent_score: number | null;
  game: string;
  best_of: number;
  handicap: string;
  played_at: string;
  status: string;
  winner_points: number;
  loser_points: number;
};
type Log = {
  id: string;
  actor_name: string;
  action: string;
  target_type: string;
  detail: string;
  created_at: string;
  can_undo: number;
};
type DashboardData = {
  stats: {
    members: number;
    activeMembers: number;
    tournaments: number;
    activeTournaments: number;
    challenges: number;
    pendingChallenges: number;
  };
  leaders: Member[];
  upcoming: Tournament[];
};

const nav: {
  section?: string;
  items: { key: NavKey; icon: typeof LayoutDashboard }[];
}[] = [
  { items: [{ key: "概览", icon: LayoutDashboard }] },
  {
    section: "社团管理",
    items: [
      { key: "成员管理", icon: UsersRound },
      { key: "正式比赛", icon: Trophy },
      { key: "社员约战", icon: Swords },
    ],
  },
  {
    section: "数据中心",
    items: [
      { key: "积分排名", icon: Award },
      { key: "数据分析", icon: BarChart3 },
    ],
  },
  { section: "系统", items: [{ key: "操作日志", icon: History }] },
];

async function api<T>(view: string): Promise<T> {
  const [name, ...parts] = view.split("&");
  const query = new URLSearchParams({ view: name });
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) query.set(key, value);
  }
  const response = await fetch(`/api/club?${query}`, { cache: "no-store" });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error((data as { error?: string }).error || "加载失败");
  return data as T;
}
async function act<T = unknown>(action: string, payload: unknown): Promise<T> {
  const response = await fetch("/api/club", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new Error((data as { error?: string }).error || "操作失败");
  return data as T;
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function parseCsvLine(line: string) {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}
function fmt(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Home() {
  const [active, setActive] = useState<NavKey>("概览"),
    [mobile, setMobile] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">8</div>
          <div>
            <b>厦门理工台球社</b>
            <small>管理系统</small>
          </div>
          <button
            className="mobile-close"
            onClick={() => setMobile(false)}
            aria-label="关闭菜单"
          >
            <X />
          </button>
        </div>
        <nav>
          {nav.map((group, index) => (
            <div className="nav-group" key={index}>
              {group.section && <p>{group.section}</p>}
              {group.items.map((item) => (
                <button
                  key={item.key}
                  className={active === item.key ? "active" : ""}
                  onClick={() => {
                    setActive(item.key);
                    setMobile(false);
                  }}
                >
                  <item.icon size={18} />
                  <span>{item.key}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button onClick={() => setActive("操作日志")}>
            <Settings size={18} />
            系统与备份
          </button>
          <div className="profile">
            <div className="avatar">负</div>
            <div>
              <b>负责人</b>
              <span>完整管理权限</span>
            </div>
            <ChevronDown size={16} />
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            className="menu-btn"
            onClick={() => setMobile(true)}
            aria-label="打开菜单"
          >
            <Menu />
          </button>
          <div>
            <span>厦门理工台球社管理中心</span>
            <b>{active}</b>
          </div>
          <div className="top-actions">
            <SchoolModeSwitcher notify={setNotice} />
            <button
              className="icon-btn"
              onClick={() => setActive("操作日志")}
              aria-label="待办"
            >
              <ClipboardCheck size={19} />
            </button>
            <div className="date">
              <CalendarDays size={17} />
              {new Date().toLocaleDateString("zh-CN")}
            </div>
          </div>
        </header>
        {notice && (
          <div className="toast" role="status">
            {notice}
            <button onClick={() => setNotice("")}>
              <X size={15} />
            </button>
          </div>
        )}
        <section className="content">
          {active === "概览" && <Dashboard go={setActive} />}{" "}
          {active === "成员管理" && <Members notify={setNotice} />}{" "}
          {active === "正式比赛" && <Tournaments notify={setNotice} />}{" "}
          {active === "社员约战" && <Challenges notify={setNotice} />}{" "}
          {active === "积分排名" && <Leaderboard />}{" "}
          {active === "数据分析" && <Analytics />}{" "}
          {active === "操作日志" && <Logs notify={setNotice} />}
        </section>
      </main>
    </div>
  );
}

function SchoolModeSwitcher({notify}:{notify:(value:string)=>void}) {
  const settings=useLoad<{schoolMode:string}>("settings");
  if (!settings.data) return null;
  return <select aria-label="学校模式" value={settings.data.schoolMode} onChange={async(e)=>{try{await act("settings.schoolMode",{mode:e.target.value}); window.location.reload()}catch(error){notify((error as Error).message)}}}>
    <option>厦门理工大学模式</option><option>华夏学院模式</option><option>两校合并模式</option>
  </select>;
}

function useLoad<T>(view: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    api<T>(view)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [view]);
  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  return { data, error, loading, refresh, setData };
}
function Head({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{sub}</span>
      </div>
      {children && <div className="head-actions">{children}</div>}
    </div>
  );
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Stat({
  label,
  value,
  note,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof UsersRound;
  accent: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${accent}`}>
        <Icon size={20} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
    </div>
  );
}
function Empty({
  title,
  description,
  action,
  onClick,
}: {
  title: string;
  description: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-ball">8</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="primary" onClick={onClick}>
          <Plus size={16} />
          {action}
        </button>
      )}
    </div>
  );
}
function Loading() {
  return (
    <div className="empty-state">
      <RefreshCw className="spin" />
      <p>正在读取数据…</p>
    </div>
  );
}
function ErrorBox({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="error-box">
      <b>无法加载</b>
      <span>{message}</span>
      <button className="secondary" onClick={retry}>
        重试
      </button>
    </div>
  );
}
function Modal({
  title,
  sub,
  close,
  children,
}: {
  title: string;
  sub: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div
        className="modal modal-wide"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title">
          <div>
            <h2>{title}</h2>
            <p>{sub}</p>
          </div>
          <button onClick={close} aria-label="关闭">
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Dashboard({ go }: { go: (v: NavKey) => void }) {
  const { data, error, loading, refresh } = useLoad<DashboardData>("dashboard");
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  const d = data!;
  return (
    <>
      <Head
        eyebrow="负责人工作台"
        title="社团运行概览"
        sub="所有数据均来自当前数据库。"
      >
        <button className="primary" onClick={() => go("正式比赛")}>
          <Plus size={17} />
          创建比赛
        </button>
      </Head>
      <div className="stats">
        <Stat
          label="在社成员"
          value={String(d.stats.activeMembers)}
          note={`共录入 ${d.stats.members} 人`}
          icon={UsersRound}
          accent="green"
        />
        <Stat
          label="正式比赛"
          value={String(d.stats.tournaments)}
          note={`进行或待签到 ${d.stats.activeTournaments} 场`}
          icon={Trophy}
          accent="gold"
        />
        <Stat
          label="待审核约战"
          value={String(d.stats.pendingChallenges)}
          note={`累计约战 ${d.stats.challenges} 场`}
          icon={Swords}
          accent="blue"
        />
        <Stat
          label="本月参与率"
          value={d.stats.activeMembers ? "待统计" : "0%"}
          note="随比赛记录更新"
          icon={Activity}
          accent="violet"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>近期赛程</h2>
              <p>即将开始的正式比赛</p>
            </div>
            <button onClick={() => go("正式比赛")}>管理赛事</button>
          </div>
          {d.upcoming.length ? (
            d.upcoming.map((t) => (
              <div className="schedule" key={t.id}>
                <div className="date-block">
                  <b>{new Date(t.starts_at).getDate()}</b>
                  <span>{new Date(t.starts_at).getMonth() + 1}月</span>
                </div>
                <div className="match-info">
                  <Badge tone="blue">{t.status}</Badge>
                  <h3>{t.name}</h3>
                  <p>
                    {t.game} · {t.format} · {t.best_of}局
                  </p>
                </div>
              </div>
            ))
          ) : (
            <Empty
              title="暂无赛程"
              description="创建第一场比赛后会显示在这里。"
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>积分榜前五</h2>
              <p>积分与 Elo 综合排序</p>
            </div>
            <button onClick={() => go("积分排名")}>完整榜单</button>
          </div>
          {d.leaders.length ? (
            d.leaders.map((m, i) => (
              <div className="rank-row" key={m.id}>
                <span className={`rank n${i + 1}`}>{i + 1}</span>
                <div className="mini-avatar">{m.name[0]}</div>
                <div>
                  <b>{m.name}</b>
                  <small>{m.major}</small>
                </div>
                <strong>
                  {m.points}
                  <small>分</small>
                </strong>
              </div>
            ))
          ) : (
            <Empty title="暂无排名" description="审核比赛结果后自动生成。" />
          )}
        </section>
      </div>
    </>
  );
}

function Members({ notify }: { notify: (v: string) => void }) {
  const [includeArchived,setIncludeArchived]=useState(false);
  const { data, error, loading, refresh } = useLoad<{ members: Member[] }>(
    `members&includeArchived=${includeArchived?"1":"0"}`,
  );
  const [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Member | null | undefined>(undefined),
    [profile,setProfile]=useState<Member|null>(null);
  const file = useRef<HTMLInputElement>(null);
  const list = useMemo(
    () =>
      data?.members.filter((m) =>
        `${m.name}${m.school}${m.major}${m.student_id}${m.tag}`.includes(query),
      ) || [],
    [data, query],
  );
  const remove = async (m: Member) => {
    if (!confirm(`确定将成员“${m.name}”移出当前名单吗？其成员档案、比赛记录和积分流水会永久保留。`)) return;
    try {
      await act("member.delete", { id: m.id });
      notify("成员已归档，档案与积分流水已保留");
      refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const exportCsv = () => {
    const rows = [
      ["姓名", "性别", "专业年级", "学号", "联系方式", "学校", "角色", "标签", "状态"],
      ...(data?.members || []).map((m) => [
        m.name,
        m.gender,
        m.major,
        m.student_id,
        m.phone,
        m.school,
        m.role,
        m.tag,
        m.status,
      ]),
    ];
    download(
      "厦门理工台球社成员名单.csv",
      "\ufeff" +
        rows
          .map((r) =>
            r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
          )
          .join("\r\n"),
      "text/csv;charset=utf-8",
    );
  };
  const importCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const lines = text
        .replace(/^\ufeff/, "")
        .split(/\r?\n/)
        .filter(Boolean);
      const hasSchoolColumn = parseCsvLine(lines[0] || "").includes("学校");
      const rows = lines.slice(1).map((line) => {
        const cells = parseCsvLine(line);
        return {
          name: cells[0],
          gender: cells[1],
          major: cells[2],
          studentId: cells[3],
          phone: cells[4],
          school: hasSchoolColumn ? (cells[5] || "厦门理工大学") : "厦门理工大学",
          role: cells[hasSchoolColumn ? 6 : 5] || "社员",
          tag: cells[hasSchoolColumn ? 7 : 6] || "新手",
          status: cells[hasSchoolColumn ? 8 : 7] || "在社",
        };
      });
      const result = await act<{ created: number; updated: number }>(
        "members.import",
        { rows },
      );
      notify(`导入完成：新增 ${result.created} 人，更新 ${result.updated} 人`);
      refresh();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      e.target.value = "";
    }
  };
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  return (
    <>
      <Head
        eyebrow="社团管理"
        title="成员管理"
        sub="新增、修改、删除、批量导入或导出社员资料。"
      >
        <input
          ref={file}
          hidden
          type="file"
          accept=".csv"
          onChange={importCsv}
        />
        <button className="secondary" onClick={() => file.current?.click()}>
          <Upload size={17} />
          批量导入
        </button>
        <button className="secondary" onClick={exportCsv}>
          <Download size={17} />
          导出名单
        </button>
        <button className="primary" onClick={() => setEditing(null)}>
          <Plus size={17} />
          录入成员
        </button>
        <label className="inline-check"><input type="checkbox" checked={includeArchived} onChange={(e)=>setIncludeArchived(e.target.checked)}/>显示已归档</label>
      </Head>
      <section className="panel table-panel">
        <div className="toolbar">
          <div className="search">
            <Search size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索姓名、学校、学号、专业或标签"
            />
          </div>
          <Badge tone="green">{list.length} 条记录</Badge>
        </div>
        {list.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>成员</th>
                  <th>专业年级</th>
                  <th>学校</th>
                  <th>学号</th>
                  <th>联系方式</th>
                  <th>角色/标签</th>
                  <th>状态</th>
                  <th>积分/Elo</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="member-cell">
                        <div className="mini-avatar">{m.name[0]}</div>
                        <b>{m.name}</b>
                      </div>
                    </td>
                    <td>{m.major}</td>
                    <td>{m.school}</td>
                    <td>{m.student_id}</td>
                    <td>{m.phone}</td>
                    <td>
                      <Badge tone={m.role === "负责人" ? "amber" : "neutral"}>
                        {m.role}
                      </Badge>{" "}
                      <Badge>{m.tag}</Badge>
                    </td>
                    <td>
                      <Badge tone={m.status === "在社" ? "green" : "neutral"}>
                        {m.status}
                      </Badge>
                    </td>
                    <td>
                      <b>{m.points}</b> / {m.elo}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button onClick={()=>setProfile(m)} aria-label={`查看${m.name}档案`}><History size={16}/></button>
                        {!m.deleted_at && <button
                          onClick={() => setEditing(m)}
                          aria-label={`修改${m.name}`}
                        >
                          <Pencil size={16} />
                        </button>}
                        {m.deleted_at ? <button className="secondary" onClick={async()=>{await act("member.restore",{id:m.id});notify("成员已恢复");refresh()}}>恢复</button> : <button
                          className="danger"
                          onClick={() => remove(m)}
                          aria-label={`删除${m.name}`}
                        >
                          <Trash2 size={16} />
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="还没有成员记录"
            description="录入第一位成员，或使用 CSV 文件批量导入。"
            action="录入成员"
            onClick={() => setEditing(null)}
          />
        )}
      </section>
      {editing !== undefined && (
        <MemberForm
          value={editing}
          close={() => setEditing(undefined)}
          saved={() => {
            setEditing(undefined);
            notify(editing ? "成员资料已更新" : "成员已添加");
            refresh();
          }}
        />
      )}
      {profile && <MemberProfile member={profile} close={()=>setProfile(null)} changed={()=>{refresh();setProfile(null)}} notify={notify}/>} 
    </>
  );
}

function MemberForm({
  value,
  close,
  saved,
}: {
  value: Member | null;
  close: () => void;
  saved: () => void;
}) {
  const settings=useLoad<{schoolMode:string}>("settings");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const defaultSchool=value?.school || (settings.data?.schoolMode==="华夏学院模式"?"华夏学院":"厦门理工大学");
  const submit = async (data: FormData) => {
    setBusy(true);
    setError("");
    const payload = {
      id: value?.id,
      name: String(data.get("name")),
      gender: String(data.get("gender")),
      major: String(data.get("major")),
      studentId: String(data.get("studentId")),
      phone: String(data.get("phone")),
      school: String(data.get("school")),
      role: String(data.get("role")),
      tag: String(data.get("tag")),
      status: String(data.get("status")),
    };
    try {
      await act(value ? "member.update" : "member.create", payload);
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={value ? "修改成员" : "录入新成员"}
      sub="姓名、学号和联系方式属于个人信息，仅负责人可查看。"
      close={close}
    >
      <form action={submit}>
        <div className="form-grid">
          <label>
            姓名
            <input name="name" required defaultValue={value?.name} />
          </label>
          <label>
            性别
            <select name="gender" defaultValue={value?.gender || "男"}>
              <option>男</option>
              <option>女</option>
              <option>待补充</option>
            </select>
          </label>
          <label>
            专业与年级
            <input
              name="major"
              required
              placeholder="如：26级金融"
              defaultValue={value?.major}
            />
          </label>
          <label>
            学号
            <input
              name="studentId"
              required
                pattern="(?:[0-9]{6,20}|待补充-[0-9]{3,})"
              defaultValue={value?.student_id}
            />
          </label>
          <label>
            联系方式
            <input
              name="phone"
              required
              pattern="(?:[0-9]{7,20}|待补充-[0-9]{3,})"
              defaultValue={value?.phone}
            />
          </label>
          <label>
            学校
            <select key={defaultSchool} name="school" defaultValue={defaultSchool}>
              <option>厦门理工大学</option><option>华夏学院</option>
            </select>
          </label>
          <label>
            角色
            <select name="role" defaultValue={value?.role || "社员"}>
              <option>社员</option>
              <option>负责人</option>
            </select>
          </label>
          <label>
            标签
            <select name="tag" defaultValue={value?.tag || "新手"}>
              <option>新手</option>
              <option>进阶</option>
              <option>高手</option>
              <option>裁判</option>
            </select>
          </label>
          <label>
            状态
            <select name="status" defaultValue={value?.status || "在社"}>
              <option>在社</option>
              <option>暂停活动</option>
              <option>退社</option>
              <option>毕业</option>
            </select>
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "保存中…" : "保存成员"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MemberProfile({member,close,changed,notify}:{member:Member;close:()=>void;changed:()=>void;notify:(value:string)=>void}) {
  const profile=useLoad<{member:Member;ledger:LedgerEntry[]}>(`member-profile&memberId=${member.id}`);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[defaultTime]=useState(()=>{const value=new Date();return new Date(value.getTime()-value.getTimezoneOffset()*60000).toISOString().slice(0,16)});
  const submit=async(data:FormData)=>{setBusy(true);setError("");try{
    const localTime=String(data.get("occurredAt"));
    await act("member.points.adjust",{id:member.id,delta:Number(data.get("delta")),reason:String(data.get("reason")),occurredAt:new Date(localTime).toISOString()});
    notify("积分调整已记录到成员档案"); changed();
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}};
  return <Modal title={`${member.name} · 成员档案`} sub="成员归档后，基本信息和全部积分流水仍会永久保留。" close={close}>
    {profile.loading?<Loading/>:profile.error?<ErrorBox message={profile.error} retry={profile.refresh}/>:<>
      <div className="form-grid"><p><b>学校</b><br/>{profile.data!.member.school}</p><p><b>专业</b><br/>{profile.data!.member.major}</p><p><b>学号</b><br/>{profile.data!.member.student_id}</p><p><b>当前积分</b><br/>{profile.data!.member.points}</p></div>
      <form action={submit}><div className="form-grid"><label>积分调整（正数增加、负数扣减）<input name="delta" type="number" min="-10000" max="10000" required/></label><label>发生时间<input name="occurredAt" type="datetime-local" required defaultValue={defaultTime}/></label><label className="full">原因<input name="reason" required minLength={2} maxLength={200} placeholder="如：活动奖励、纪律扣分"/></label></div>{error&&<p className="form-error">{error}</p>}<div className="modal-actions"><button className="primary" disabled={busy}>{busy?"记录中…":"确认调整积分"}</button></div></form>
      <h3>积分流水</h3><div className="log-panel">{profile.data!.ledger.length?profile.data!.ledger.map(entry=><div className="log-row" key={entry.id}><span className="log-dot"/><div><b className={entry.reversed_at?"":"points"}>{entry.points_delta>=0?"+":""}{entry.points_delta} 分 {entry.reversed_at?"（已冲销）":""}</b><p>{entry.source_type} · {entry.reason}</p><small>{entry.operator_name||"系统"} · {fmt(entry.created_at)}{entry.reversed_at?` · 冲销于 ${fmt(entry.reversed_at)}`:""}</small></div></div>):<p>暂无积分流水</p>}</div>
    </>}
  </Modal>;
}

function Tournaments({ notify }: { notify: (v: string) => void }) {
  const ts = useLoad<{ tournaments: Tournament[] }>("tournaments"),
    ms = useLoad<{ members: Member[] }>("members");
  const [creating, setCreating] = useState(false),
    [editingTournament, setEditingTournament] = useState<Tournament | null>(null),
    [selected, setSelected] = useState<Tournament | null>(null),
    [matches, setMatches] = useState<Match[]>([]);
  const open = async (t: Tournament) => {
    setSelected(t);
    const result = await api<{ matches: Match[] }>(
      `matches&tournamentId=${t.id}`,
    );
    setMatches(result.matches);
  };
  const generate = async () => {
    if (!selected) return;
    try {
      await act("tournament.generate", { tournamentId: selected.id });
      notify("签表已生成");
      open(selected);
      ts.refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const removeTournament = async (t: Tournament) => {
    if (!confirm(`确定删除比赛“${t.name}”吗？相关签表、比分和积分将同步撤销。`)) return;
    try {
      await act("tournament.delete", { id: t.id });
      notify("比赛已删除");
      setSelected(null);
      ts.refresh();
    } catch (error) {
      notify((error as Error).message);
    }
  };
  if (ts.loading || ms.loading) return <Loading />;
  if (ts.error || ms.error)
    return (
      <ErrorBox
        message={ts.error || ms.error}
        retry={() => {
          ts.refresh();
          ms.refresh();
        }}
      />
    );
  return (
    <>
      <Head
        eyebrow="赛事中心"
        title="正式比赛"
        sub="创建赛事、设置赛制、生成签表并录入比分。"
      >
        <button
          className="primary"
          onClick={() => setCreating(true)}
          disabled={(ms.data?.members.length || 0) < 2}
        >
          <Plus size={17} />
          创建比赛
        </button>
      </Head>
      {(ms.data?.members.length || 0) < 2 && (
        <div className="hint">至少录入两名成员后才能创建比赛。</div>
      )}
      <div className="cards-grid">
        {ts.data!.tournaments.map((t) => (
          <section className="event-card" key={t.id}>
            <div className="event-top">
              <Badge tone={t.status === "进行中" ? "green" : "blue"}>
                {t.status}
              </Badge>
              <span>{t.participant_count}人</span>
            </div>
            <div className="event-ball">8</div>
            <h2>{t.name}</h2>
            <p>
              {t.game} · {t.format} · {t.team_mode} · {t.best_of}局
            </p>
            <div className="event-meta">
              <span>
                <CalendarDays size={16} />
                {fmt(t.starts_at)}
              </span>
              <span>{t.location || "未填写地点"}</span>
            </div>
            <div className="event-actions">
              <button className="dark" onClick={() => open(t)}>
                管理赛事
              </button>
              <button className="secondary" onClick={() => setEditingTournament(t)}><Pencil size={15}/>修改</button>
              <button className="danger" onClick={() => removeTournament(t)}><Trash2 size={15}/>删除</button>
            </div>
          </section>
        ))}
      </div>
      {!ts.data!.tournaments.length && (
        <section className="panel">
          <Empty
            title="还没有比赛"
            description="创建比赛并选择参赛成员后，可一键生成晋级签表。"
            action="创建比赛"
            onClick={() => setCreating(true)}
          />
        </section>
      )}
      {selected && (
        <Modal
          title={selected.name}
          sub={`${selected.format} · ${selected.best_of}局 · ${selected.handicap}`}
          close={() => setSelected(null)}
        >
          <div className="modal-tools">
            <button className="primary" onClick={generate}>
              一键生成晋级图
            </button>
            <button className="secondary" onClick={() => setEditingTournament(selected)}><Pencil size={16}/>修改比赛</button>
            <button className="danger" onClick={() => removeTournament(selected)}><Trash2 size={16}/>删除比赛</button>
          </div>
          {matches.length ? (
            <Bracket matches={matches} format={selected.format} notify={notify} refresh={() => open(selected)} />
          ) : (
            <Empty
              title="尚未生成签表"
              description="参赛成员默认视为已签到，点击生成签表开始比赛。"
            />
          )}
        </Modal>
      )}
      {creating && (
        <TournamentForm
          members={ms.data!.members}
          close={() => setCreating(false)}
          saved={() => {
            setCreating(false);
            notify("比赛已创建");
            ts.refresh();
          }}
        />
      )}
      {editingTournament && (
        <TournamentEditForm value={editingTournament} close={() => setEditingTournament(null)} saved={() => {setEditingTournament(null);setSelected(null);notify("比赛资料已更新");ts.refresh();}} />
      )}
    </>
  );
}

function TournamentForm({
  members,
  close,
  saved,
}: {
  members: Member[];
  close: () => void;
  saved: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>(members.map((m) => m.id)),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const roundCount = Math.ceil(Math.log2(Math.max(2, chosen.length)));
  const submit = async (data: FormData) => {
    setBusy(true);
    setError("");
    try {
      await act("tournament.create", {
        name: String(data.get("name")),
        game: String(data.get("game")),
        format: String(data.get("format")),
        teamMode: String(data.get("teamMode")),
        bestOf: Number(data.get("bestOf")),
        handicap: String(data.get("handicap")),
        startsAt: String(data.get("startsAt")),
        location: String(data.get("location")),
        winnerPoints: Number(data.get("winnerPoints")),
        loserPoints: Number(data.get("loserPoints")),
        participantIds: chosen,
        roundBestOf: Array.from({ length: roundCount }, (_, index) => Number(data.get(`roundBestOf-${index + 1}`))),
      });
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="创建正式比赛" sub="选择参赛者并配置赛制。" close={close}>
      <form action={submit}>
        <div className="form-grid">
          <label className="full">
            比赛名称
            <input name="name" required />
          </label>
          <label>
            比赛项目
            <input name="game" defaultValue="中式八球" required />
          </label>
          <label>
            淘汰赛制
            <select name="format">
              <option>单败</option>
              <option>双败</option>
            </select>
          </label>
          <label>
            参赛方式
            <select name="teamMode">
              <option>单打</option>
            </select>
          </label>
          <label>
            默认局数
            <select name="bestOf">
              <option value="1">一局定胜负</option>
              <option value="3">三局两胜</option>
              <option value="5">五局三胜</option>
              <option value="7">七局四胜</option>
              <option value="9">九局五胜</option><option value="11">十一局六胜</option><option value="13">十三局七胜</option><option value="15">十五局八胜</option>
            </select>
          </label>
          <label>
            让球规则
            <input name="handicap" defaultValue="不让球" />
          </label>
          <label>胜者积分<input name="winnerPoints" type="number" min="0" max="10000" defaultValue="3" required /></label>
          <label>负者积分<input name="loserPoints" type="number" min="0" max="10000" defaultValue="1" required /></label>
          <label>
            开始时间
            <input type="datetime-local" name="startsAt" required />
          </label>
          <label className="full">
            地点
            <input name="location" placeholder="如：学生活动中心台球室" />
          </label>
        </div>
        <fieldset className="member-picker"><legend>各轮局制</legend>{Array.from({length:roundCount},(_,index)=><label key={index}>第 {index+1} 轮<select name={`roundBestOf-${index+1}`} defaultValue="3">{[1,3,5,7,9,11,13,15].map(v=><option key={v} value={v}>{v}局{Math.floor(v/2)+1}胜</option>)}</select></label>)}</fieldset>
        <fieldset className="member-picker">
          <legend>参赛成员（已选 {chosen.length} 人）</legend>
          {members.map((m) => (
            <label key={m.id}>
              <input
                type="checkbox"
                checked={chosen.includes(m.id)}
                onChange={(e) =>
                  setChosen((v) =>
                    e.target.checked
                      ? [...v, m.id]
                      : v.filter((id) => id !== m.id),
                  )
                }
              />
              {m.name}
              <small>{m.major}</small>
            </label>
          ))}
        </fieldset>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            取消
          </button>
          <button className="primary" disabled={busy || chosen.length < 2}>
            {busy ? "创建中…" : "创建比赛"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TournamentEditForm({value,close,saved}:{value:Tournament;close:()=>void;saved:()=>void}) {
  const rounds=Math.ceil(Math.log2(Math.max(2,value.participant_count)));
  const current=(()=>{try{return JSON.parse(value.round_best_of||"[]") as number[]}catch{return []}})();
  const[busy,setBusy]=useState(false),[error,setError]=useState("");
  const submit=async(data:FormData)=>{setBusy(true);setError("");try{await act("tournament.update",{id:value.id,name:String(data.get("name")),game:String(data.get("game")),bestOf:Number(data.get("bestOf")),roundBestOf:Array.from({length:rounds},(_,i)=>Number(data.get(`roundBestOf-${i+1}`))),handicap:String(data.get("handicap")),startsAt:String(data.get("startsAt")),location:String(data.get("location")),winnerPoints:Number(data.get("winnerPoints")),loserPoints:Number(data.get("loserPoints"))});saved()}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
  return <Modal title="修改比赛" sub="可修改比赛项目、积分、时间和每一轮局制。" close={close}><form action={submit}><div className="form-grid"><label className="full">比赛名称<input name="name" required defaultValue={value.name}/></label><label>比赛项目<input name="game" required defaultValue={value.game}/></label><label>默认局数<select name="bestOf" defaultValue={value.best_of}>{[1,3,5,7,9,11,13,15].map(v=><option key={v} value={v}>{v}局{Math.floor(v/2)+1}胜</option>)}</select></label><label>让球规则<input name="handicap" defaultValue={value.handicap}/></label><label>胜者积分<input name="winnerPoints" type="number" min="0" max="10000" defaultValue={value.winner_points} required/></label><label>负者积分<input name="loserPoints" type="number" min="0" max="10000" defaultValue={value.loser_points} required/></label><label>开始时间<input type="datetime-local" name="startsAt" required defaultValue={value.starts_at.slice(0,16)}/></label><label className="full">地点<input name="location" defaultValue={value.location}/></label></div><fieldset className="member-picker"><legend>各轮局制</legend>{Array.from({length:rounds},(_,i)=><label key={i}>第 {i+1} 轮<select name={`roundBestOf-${i+1}`} defaultValue={current[i]||value.best_of}>{[1,3,5,7,9,11,13,15].map(v=><option key={v} value={v}>{v}局{Math.floor(v/2)+1}胜</option>)}</select></label>)}</fieldset>{error&&<p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={close}>取消</button><button className="primary" disabled={busy}>{busy?"保存中…":"保存修改"}</button></div></form></Modal>
}

function Bracket({matches,format,notify,refresh}:{matches:Match[];format:"单败"|"双败";notify:(v:string)=>void;refresh:()=>void}) {
  const groups=Object.entries(matches.reduce<Record<string,Match[]>>((all,m)=>{const key=`${m.bracket} · 第${m.round_no}轮`; (all[key]??=[]).push(m);return all},{}));
  return <div className="bracket-scroll"><div className="bracket-board">{groups.map(([title,items])=><section className="bracket-round" key={title}><header><b>{title}</b><span>{items[0]?.best_of}局{Math.floor((items[0]?.best_of||1)/2)+1}胜</span></header>{items.map(m=><MatchRow key={m.id} match={m} allowResultEdit={format==="单败"} notify={notify} refresh={refresh}/>)}</section>)}</div></div>
}

function MatchRow({
  match,
  notify,
  refresh,
  allowResultEdit,
}: {
  match: Match;
  notify: (v: string) => void;
  refresh: () => void;
  allowResultEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const submit = async (data: FormData) => {
    try {
      await act(match.status === "已结束" ? "match.result.update" : "match.result", {
        matchId: match.id,
        player1Score: Number(data.get("score1")),
        player2Score: Number(data.get("score2")),
      });
      setEditing(false);
      notify(match.status === "已结束" ? "比赛结果已修改" : "比分已录入并自动晋级");
      refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <div className="match-row">
      <div>
        <Badge tone={match.status === "已结束" ? "green" : "blue"}>
          {match.bracket} 第{match.round_no}轮
        </Badge>
        <b>
          {match.player1_name || "待定"} <span>VS</span>{" "}
          {match.player2_name || "待定"}
        </b>
        <small>场次 {match.match_no} · {match.best_of}局{Math.floor(match.best_of/2)+1}胜</small>
      </div>
      {match.status === "已结束" ? (
        <div className="row-actions"><strong>{match.player1_score}:{match.player2_score}</strong>{allowResultEdit&&<button className="secondary" onClick={()=>setEditing(true)}><Pencil size={15}/>修改结果</button>}</div>
      ) : match.player1_id && match.player2_id ? (
        <button className="secondary" onClick={() => setEditing(true)}>
          录入比分
        </button>
      ) : (
        <Badge>等待晋级</Badge>
      )}
      {editing && (
        <Modal
          title={match.status === "已结束" ? "修改比赛结果" : "录入比赛结果"}
          sub={`${match.player1_name} VS ${match.player2_name}`}
          close={() => setEditing(false)}
        >
          <form action={submit}>
            <div className="score-form">
              <label>
                {match.player1_name}
                <input type="number" min="0" name="score1" required defaultValue={match.player1_score ?? undefined} />
              </label>
              <b>:</b>
              <label>
                {match.player2_name}
                <input type="number" min="0" name="score2" required defaultValue={match.player2_score ?? undefined} />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(false)}
              >
                取消
              </button>
              <button className="primary">确认结果</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Challenges({ notify }: { notify: (v: string) => void }) {
  const cs = useLoad<{ challenges: Challenge[] }>("challenges"),
    ms = useLoad<{ members: Member[] }>("members");
  const [creating, setCreating] = useState(false);
  const action = async (name: string, payload: unknown, message: string) => {
    try {
      await act(name, payload);
      notify(message);
      cs.refresh();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  if (cs.loading || ms.loading) return <Loading />;
  if (cs.error || ms.error)
    return (
      <ErrorBox
        message={cs.error || ms.error}
        retry={() => {
          cs.refresh();
          ms.refresh();
        }}
      />
    );
  return (
    <>
      <Head
        eyebrow="约战中心"
        title="社员约战"
        sub="一方提交比分、对方确认、负责人审核后自动计分。"
      >
        <button
          className="primary"
          onClick={() => setCreating(true)}
          disabled={(ms.data?.members.length || 0) < 2}
        >
          <Plus size={17} />
          发起约战
        </button>
      </Head>
      <section className="panel table-panel">
        {cs.data!.challenges.length ? (
          <div className="challenge-list">
            {cs.data!.challenges.map((c) => (
              <div className="challenge" key={c.id}>
                <div className="challenge-id">
                  <small>{fmt(c.played_at)}</small>
                  <b>
                    {c.challenger_name} VS {c.opponent_name}
                  </b>
                  <span>
                    {c.game} · {c.best_of}局 · {c.handicap} · 胜者 +{c.winner_points} / 负者 +{c.loser_points}
                  </span>
                </div>
                <strong>
                  {c.challenger_score == null
                    ? "—"
                    : `${c.challenger_score} : ${c.opponent_score}`}
                </strong>
                <Badge
                  tone={
                    c.status === "审核通过"
                      ? "green"
                      : c.status.includes("待")
                        ? "amber"
                        : "neutral"
                  }
                >
                  {c.status}
                </Badge>
                <div className="challenge-actions">
                  {c.status === "待对手接受" && (
                    <button
                      className="primary"
                      onClick={() =>
                        action(
                          "challenge.accept",
                          { id: c.id, accept: true },
                          "约战已接受",
                        )
                      }
                    >
                      接受
                    </button>
                  )}
                  {c.status === "待比赛" && (
                    <ScoreChallenge
                      challenge={c}
                      done={() => {
                        notify("比分已提交，等待对方确认");
                        cs.refresh();
                      }}
                    />
                  )}
                  {c.status === "待对手确认" && (
                    <button
                      className="primary"
                      onClick={() =>
                        action(
                          "challenge.confirm",
                          { id: c.id },
                          "双方比分已确认",
                        )
                      }
                    >
                      确认比分
                    </button>
                  )}
                  {c.status === "待负责人审核" && (
                    <button
                      className="primary"
                      onClick={() =>
                        action(
                          "challenge.approve",
                          { id: c.id },
                          "约战已审核，积分和 Elo 已更新",
                        )
                      }
                    >
                      审核并计分
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="还没有约战"
            description="选择两名成员发起第一场约战。"
            action="发起约战"
            onClick={() => setCreating(true)}
          />
        )}
      </section>
      {creating && (
        <ChallengeForm
          members={ms.data!.members}
          close={() => setCreating(false)}
          saved={() => {
            setCreating(false);
            notify("约战已发起");
            cs.refresh();
          }}
        />
      )}
    </>
  );
}

function ChallengeForm({
  members,
  close,
  saved,
}: {
  members: Member[];
  close: () => void;
  saved: () => void;
}) {
  const [error, setError] = useState("");
  const submit = async (data: FormData) => {
    try {
      await act("challenge.create", {
        challengerId: String(data.get("challengerId")),
        opponentId: String(data.get("opponentId")),
        game: String(data.get("game")),
        bestOf: Number(data.get("bestOf")),
        handicap: String(data.get("handicap")),
        playedAt: String(data.get("playedAt")),
        location: String(data.get("location")),
        winnerPoints: Number(data.get("winnerPoints")),
        loserPoints: Number(data.get("loserPoints")),
      });
      saved();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="发起社员约战" sub="对手接受后即可比赛。" close={close}>
      <form action={submit}>
        <div className="form-grid">
          <label>
            发起人
            <select name="challengerId">
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            对手
            <select name="opponentId">
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            项目
            <select name="game">
              <option>中式八球</option>
              <option>九球</option>
              <option>斯诺克</option>
            </select>
          </label>
          <label>
            局数
            <select name="bestOf">
              <option value="3">三局两胜</option>
              <option value="5">五局三胜</option>
              <option value="7">七局四胜</option>
            </select>
          </label>
          <label>
            让球规则
            <input name="handicap" defaultValue="不让球" />
          </label>
          <label>胜者积分<input name="winnerPoints" type="number" min="0" max="10000" defaultValue="3" required /></label>
          <label>负者积分<input name="loserPoints" type="number" min="0" max="10000" defaultValue="1" required /></label>
          <label>
            比赛时间
            <input type="datetime-local" name="playedAt" required />
          </label>
          <label className="full">
            地点
            <input name="location" />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            取消
          </button>
          <button className="primary">发起约战</button>
        </div>
      </form>
    </Modal>
  );
}
function ScoreChallenge({
  challenge,
  done,
}: {
  challenge: Challenge;
  done: () => void;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const submit = async (data: FormData) => {
    try {
      await act("challenge.submit", {
        id: challenge.id,
        challengerScore: Number(data.get("a")),
        opponentScore: Number(data.get("b")),
      });
      setOpen(false);
      done();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <button className="primary" onClick={() => setOpen(true)}>
        填写比分
      </button>
      {open && (
        <Modal
          title="提交约战比分"
          sub={`${challenge.challenger_name} VS ${challenge.opponent_name}`}
          close={() => setOpen(false)}
        >
          <form action={submit}>
            <div className="score-form">
              <label>
                {challenge.challenger_name}
                <input type="number" min="0" name="a" required />
              </label>
              <b>:</b>
              <label>
                {challenge.opponent_name}
                <input type="number" min="0" name="b" required />
              </label>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setOpen(false)}
              >
                取消
              </button>
              <button className="primary">提交比分</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function Leaderboard() {
  const { data, error, loading, refresh } = useLoad<{ leaderboard: Member[] }>(
    "leaderboard",
  );
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  return (
    <>
      <Head
        eyebrow="排名中心"
        title="积分与 Elo 排名"
        sub="积分体现成绩与活跃度，Elo 体现长期竞技实力。"
      >
        <button
          className="secondary"
          onClick={() =>
            download(
              "积分榜.csv",
              "\ufeff姓名,学校,积分,Elo,胜场,负场\r\n" +
                data!.leaderboard
                  .map(
                    (m) =>
                      `${m.name},${m.school},${m.points},${m.elo},${m.wins},${m.losses}`,
                  )
                  .join("\r\n"),
              "text/csv",
            )
          }
        >
          <Download size={17} />
          导出榜单
        </button>
      </Head>
      <section className="panel table-panel">
        {data!.leaderboard.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>排名</th>
                  <th>成员</th>
                  <th>专业</th>
                  <th>学校</th>
                  <th>胜负</th>
                  <th>积分</th>
                  <th>Elo</th>
                </tr>
              </thead>
              <tbody>
                {data!.leaderboard.map((m, i) => (
                  <tr key={m.id}>
                    <td>
                      <span className={`rank n${i + 1}`}>{i + 1}</span>
                    </td>
                    <td>
                      <b>{m.name}</b>
                    </td>
                    <td>{m.major}</td>
                    <td>{m.school}</td>
                    <td>
                      {m.wins}胜 {m.losses}负
                    </td>
                    <td>
                      <strong className="points">{m.points}</strong>
                    </td>
                    <td>{m.elo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="暂无排名"
            description="完成比赛或审核约战后自动生成。"
          />
        )}
      </section>
    </>
  );
}
function Analytics() {
  const d = useLoad<DashboardData>("dashboard"),
    l = useLoad<{ leaderboard: Member[] }>("leaderboard");
  if (d.loading || l.loading) return <Loading />;
  if (d.error || l.error)
    return (
      <ErrorBox
        message={d.error || l.error}
        retry={() => {
          d.refresh();
          l.refresh();
        }}
      />
    );
  const members = l.data!.leaderboard,
    avg = members.length
      ? Math.round(members.reduce((s, m) => s + m.elo, 0) / members.length)
      : 0;
  return (
    <>
      <Head
        eyebrow="数据中心"
        title="数据分析"
        sub="统计数据直接来自成员、赛事与约战记录。"
      />
      <div className="stats">
        <Stat
          label="在社成员"
          value={String(d.data!.stats.activeMembers)}
          note={`总记录 ${d.data!.stats.members}`}
          icon={UsersRound}
          accent="green"
        />
        <Stat
          label="正式比赛"
          value={String(d.data!.stats.tournaments)}
          note={`进行中 ${d.data!.stats.activeTournaments}`}
          icon={Trophy}
          accent="gold"
        />
        <Stat
          label="有效约战"
          value={String(d.data!.stats.challenges)}
          note={`待审核 ${d.data!.stats.pendingChallenges}`}
          icon={Swords}
          accent="blue"
        />
        <Stat
          label="平均 Elo"
          value={String(avg)}
          note="在社成员平均值"
          icon={Award}
          accent="violet"
        />
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>成员竞技表现</h2>
            <p>按 Elo 展示</p>
          </div>
        </div>
        {members.length ? (
          <div className="analytics-list">
            {members.slice(0, 12).map((m) => (
              <div key={m.id}>
                <b>{m.name}</b>
                <div>
                  <i style={{ width: `${Math.min(100, m.elo / 20)}%` }} />
                  <span>{m.elo}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="暂无分析数据"
            description="录入成员并完成比赛后自动生成。"
          />
        )}
      </section>
    </>
  );
}
function Logs({ notify }: { notify: (v: string) => void }) {
  const { data, error, loading, refresh } = useLoad<{ logs: Log[] }>("logs");
  const restoreFile = useRef<HTMLInputElement>(null);
  const undo = async (log: Log) => {
    if (!confirm(`确定撤回“${log.detail}”吗？系统将恢复到该操作之前的状态。`)) return;
    try {
      await act("operation.undo", { logId: log.id });
      notify("操作已撤回");
      refresh();
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const restore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("恢复备份会覆盖当前全部数据，确定继续吗？")) {
      e.target.value = "";
      return;
    }
    try {
      const backup = JSON.parse(await file.text());
      await act("backup.restore", { backup });
      notify("备份恢复完成");
      refresh();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      e.target.value = "";
    }
  };
  const backup = async () => {
    try {
      const response = await fetch("/api/club?view=backup");
      const result = await response.text();
      if (!response.ok) throw new Error("备份失败");
      download(
        `厦门理工台球社备份-${new Date().toISOString().slice(0, 10)}.json`,
        result,
        "application/json",
      );
      notify("数据备份已下载");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  return (
    <>
      <Head
        eyebrow="系统记录"
        title="操作日志与备份"
        sub="关键修改留痕，并可导出完整数据备份。"
      >
        <input
          ref={restoreFile}
          hidden
          type="file"
          accept=".json"
          onChange={restore}
        />
        <button
          className="secondary"
          onClick={() => restoreFile.current?.click()}
        >
          <Upload size={17} />
          恢复备份
        </button>
        <button className="secondary" onClick={backup}>
          <Download size={17} />
          下载数据备份
        </button>
      </Head>
      <section className="panel log-panel">
        {data!.logs.length ? (
          data!.logs.map((log) => (
            <div className="log-row" key={log.id}>
              <span className="log-dot" />
              <div>
                <Badge>{log.action}</Badge>
                <b>{log.detail}</b>
                <p>
                  {log.actor_name} · {fmt(log.created_at)}
                </p>
              </div>
              {Boolean(log.can_undo) && (
                <button className="secondary" onClick={() => undo(log)}>
                  <RefreshCw size={16} />撤回
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="暂无操作日志"
            description="新增、修改、删除和审核操作会记录在这里。"
          />
        )}
      </section>
    </>
  );
}
