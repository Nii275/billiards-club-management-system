import test from "node:test";
import assert from "node:assert/strict";

import {
  approveChallenge,
  buildSingleElimination,
  calculateElo,
  maskContact,
  maskStudentId,
  permissionsFor,
  resolvePointAward,
  schoolMatchesMode,
  validatePointAdjustment,
  validateMemberContact,
  validateMemberGender,
} from "../lib/business.mjs";

test("负责人拥有管理权限，社员只能使用个人和约战功能", () => {
  assert.equal(permissionsFor("负责人").manageMembers, true);
  assert.equal(permissionsFor("社员").manageMembers, false);
  assert.equal(permissionsFor("社员").createChallenge, true);
  assert.deepEqual(permissionsFor("未知角色"), { manageMembers: false, manageMatches: false, approveChallenges: false, createChallenge: false });
});

test("公开信息会隐藏学号和联系方式", () => {
  assert.equal(maskStudentId("2026012345"), "2026******");
  assert.equal(maskContact("13812345678"), "138****5678");
});

test("约战必须双方确认后才能由负责人审核并计分", () => {
  assert.throws(
    () => approveChallenge({ challengerConfirmed: true, opponentConfirmed: false }),
    /双方确认/,
  );
  assert.deepEqual(
    approveChallenge({ challengerConfirmed: true, opponentConfirmed: true, winnerId: "m1", loserId: "m2" }),
    { status: "审核通过", points: { m1: 3, m2: 1 } },
  );
});

test("Elo 胜负结果保持总分不变", () => {
  const result = calculateElo(1500, 1500, 1);
  assert.deepEqual(result, { winner: 1516, loser: 1484, delta: 16 });
});

test("单败签表会补齐轮空并生成首轮对阵", () => {
  const bracket = buildSingleElimination(["A", "B", "C", "D", "E"]);
  assert.equal(bracket.size, 8);
  assert.equal(bracket.matches.length, 4);
  assert.equal(bracket.byes, 3);
  assert.equal(bracket.matches.some((match) => match.home === null && match.away === null), false);
});

test("学校模式只筛选显示范围且两校合并模式包含全部学校", () => {
  assert.equal(schoolMatchesMode("厦门理工大学", "厦门理工大学模式"), true);
  assert.equal(schoolMatchesMode("华夏学院", "厦门理工大学模式"), false);
  assert.equal(schoolMatchesMode("华夏学院", "两校合并模式"), true);
});

test("比赛和约战积分使用各自保存的自定义胜负积分", () => {
  assert.deepEqual(resolvePointAward({ winnerPoints: 8, loserPoints: 2 }), {
    winner: 8,
    loser: 2,
  });
  assert.deepEqual(resolvePointAward({}), { winner: 3, loser: 1 });
});

test("手动积分调整必须非零并限制绝对值", () => {
  assert.equal(validatePointAdjustment(20), 20);
  assert.throws(() => validatePointAdjustment(0), /不能为 0/);
  assert.throws(() => validatePointAdjustment(10001), /范围/);
});

test("资料待补充成员可以使用待补充占位值", () => {
  assert.equal(validateMemberGender("待补充"), "待补充");
  assert.equal(validateMemberGender("女"), "女");
  assert.equal(validateMemberContact("待补充-001"), "待补充-001");
  assert.equal(validateMemberContact("13812345678"), "13812345678");
  assert.throws(() => validateMemberGender("未知"), /性别/);
  assert.throws(() => validateMemberContact("abc"), /联系方式/);
});
