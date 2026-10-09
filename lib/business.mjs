export function permissionsFor(role) {
  if (role === "负责人") return { manageMembers: true, manageMatches: true, approveChallenges: true, createChallenge: true };
  if (role === "社员") return { manageMembers: false, manageMatches: false, approveChallenges: false, createChallenge: true };
  return { manageMembers: false, manageMatches: false, approveChallenges: false, createChallenge: false };
}

export function maskStudentId(value) {
  return value.length <= 4 ? "*".repeat(value.length) : `${value.slice(0, 4)}${"*".repeat(value.length - 4)}`;
}

export function maskContact(value) {
  return value.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2");
}

export function approveChallenge(challenge) {
  if (!challenge.challengerConfirmed || !challenge.opponentConfirmed) throw new Error("约战结果必须经过双方确认");
  return { status: "审核通过", points: { [challenge.winnerId]: 3, [challenge.loserId]: 1 } };
}

export function calculateElo(winnerRating, loserRating, score, k = 32) {
  const expected = 1 / (1 + 10 ** ((loserRating - winnerRating) / 400));
  const delta = Math.round(k * (score - expected));
  return { winner: winnerRating + delta, loser: loserRating - delta, delta };
}

export function buildSingleElimination(players) {
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, players.length)));
  const byes = size - players.length;
  const matches = players.slice(0, byes).map((player) => ({ home: player, away: null }));
  const paired = players.slice(byes);
  for (let index = 0; index < paired.length; index += 2) matches.push({ home: paired[index], away: paired[index + 1] ?? null });
  return { size, matches, byes };
}

export function schoolMatchesMode(school, mode) {
  if (mode === "两校合并模式") return true;
  if (mode === "厦门理工大学模式") return school === "厦门理工大学";
  if (mode === "华夏学院模式") return school === "华夏学院";
  return false;
}

export function resolvePointAward(value = {}) {
  const winner = Number.isInteger(value.winnerPoints) ? value.winnerPoints : 3;
  const loser = Number.isInteger(value.loserPoints) ? value.loserPoints : 1;
  if (winner < 0 || winner > 10000 || loser < 0 || loser > 10000) {
    throw new Error("比赛积分范围应为 0 到 10000");
  }
  return { winner, loser };
}

export function validatePointAdjustment(value) {
  if (!Number.isInteger(value) || value === 0) throw new Error("积分调整不能为 0");
  if (Math.abs(value) > 10000) throw new Error("积分调整范围为 -10000 到 10000");
  return value;
}

export function validateMemberGender(value) {
  if (!["男", "女", "待补充"].includes(value)) throw new Error("性别信息无效");
  return value;
}

export function validateMemberContact(value) {
  if (!/^(?:\d{7,20}|待补充-\d{3,})$/.test(value)) throw new Error("联系方式格式无效");
  return value;
}
