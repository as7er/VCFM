/**
 * 更衣室审计：关系网由真实事实推导、派系与摩擦可解释、不写入隐藏修正。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CLUB_TEMPLATES } from "../js/data.js";
import { createWorld } from "../js/models.js";
import {
  playerBond,
  dressingRoomLeaders,
  dressingRoomFactions,
  dressingRoomFrictions,
  dressingRoomHarmony,
  harmonyLabel,
  processDressingRoomDay,
  hasPendingTransferRequest,
  BOND_ALLY,
  BOND_FRICTION,
} from "../js/dressing-room.js";
import { ensurePlayerPathway } from "../js/player-pathway.js";

const repo = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(repo, "js/dressing-room.js"), "utf8");

const startClub = CLUB_TEMPLATES.find((club) => club.division === 3);
const world = createWorld(startClub.id, "Dressing Room Audit", "zh");
const club = world.clubs.find((c) => c.id === world.userClubId);
assert.ok(club && club.players.length >= 11, "audit needs a full squad");

// ── 关系分：必须由真实事实解释，且同一输入稳定 ──
const [a, b] = club.players;
const first = playerBond(a, b, world);
assert.equal(playerBond(a, b, world), first, "bond must be deterministic for the same inputs");
assert.equal(playerBond(a, b), first, "bond must not depend on the world argument");
assert.equal(playerBond(a, a, world), 0, "a player has no bond with himself");
assert.ok(first >= -100 && first <= 100, "bond stays in range");

// 同国籍必须强于不同国籍（其余事实相同）
const base = { id: "x1", nationality: "ENG", age: 25, pos: "MID", clubId: club.id, history: [], stats: {} };
const sameNation = { ...base, id: "x2" };
const otherNation = { ...base, id: "x3", nationality: "BRA" };
assert.ok(
  playerBond(base, sameNation, world) > playerBond(base, otherNation, world),
  "shared nationality must strengthen a bond"
);

// 但同国籍单独不足以成帮：否则关系网会退化成按护照聚类，
// 同国籍人数多的球队永远只有一个大阵营（实测 34 分权重时正是如此）。
const elder = { ...base, id: "x9", age: 40 };
assert.ok(
  playerBond(base, elder) < BOND_ALLY,
  "nationality plus tenure alone must not clear the ally threshold"
);

// 同位置竞争必须弱于不同位置
const rivalGk = { ...base, id: "x4", pos: "GK" };
const baseGk = { ...base, id: "x5", pos: "GK" };
const outfield = { ...base, id: "x6", pos: "ATT" };
assert.ok(
  playerBond(baseGk, rivalGk, world) < playerBond(baseGk, outfield, world),
  "direct positional rivalry must weaken a bond"
);

// 年龄差距大必须弱于年龄相近
const peer = { ...base, id: "x7", age: 26 };
const veteran = { ...base, id: "x8", age: 38 };
assert.ok(
  playerBond(base, peer, world) > playerBond(base, veteran, world),
  "a wide age gap must weaken a bond"
);

// ── 领袖：队长必定入选，且排序稳定 ──
club.tactics = club.tactics || {};
const captain = club.players[5];
club.tactics.captainId = captain.id;
const leaders = dressingRoomLeaders(club, world, 4);
assert.equal(leaders.length, 4, "expected four dressing-room leaders");
assert.ok(leaders.some((p) => p.id === captain.id), "the captain must be a dressing-room leader");
assert.deepEqual(
  dressingRoomLeaders(club, world, 4).map((p) => p.id),
  leaders.map((p) => p.id),
  "leader order must be stable"
);

// ── 派系：成员不重复、至少三人、领袖在自己派系内 ──
const factions = dressingRoomFactions(club, world);
const factionCap = Math.max(3, Math.floor(club.players.length / 3));
const seen = new Set();
for (const faction of factions) {
  assert.ok(faction.size >= 3, "a faction needs at least three players");
  assert.ok(faction.size <= factionCap, `a faction must not exceed ${factionCap} players`);
  assert.ok(faction.memberIds.includes(faction.leaderId), "the leader belongs to his own faction");
  for (const id of faction.memberIds) {
    assert.ok(!seen.has(id), `player ${id} must not belong to two factions`);
    seen.add(id);
  }
}

// ── 摩擦：报告的组合必须真的低于阈值 ──
// 新建世界所有人 apps=0，摩擦按设计不成立；补上出场数据后再验证，
// 否则这条代码路径永远测不到。
const frictionsAtKickoff = dressingRoomFrictions(club, world).length;
assert.equal(frictionsAtKickoff, 0, "nobody has played yet, so there is no on-pitch friction");

// 直接构造纯竞争场景：同位置、异国籍、年龄悬殊、出场差距大。
// 不复用随机生成的门将——他们可能同国籍或同龄，那些正向纽带会抵消竞争。
const starterGk = { id: "gk_a", nationality: "ENG", age: 33, pos: "GK", clubId: club.id, history: [], stats: { apps: 12 } };
const benchGk = { id: "gk_b", nationality: "BRA", age: 20, pos: "GK", clubId: club.id, history: [], stats: { apps: 2 } };
const benchView = playerBond(benchGk, starterGk);
assert.ok(
  benchView <= BOND_FRICTION,
  `a benched keeper must resent the starter (got ${benchView}, need <= ${BOND_FRICTION})`
);
// 竞争是不对称的：主力没那么在意替补
assert.ok(
  playerBond(starterGk, benchGk) > benchView,
  "the starter should mind the rivalry less than the benched keeper"
);

// 同样两人若同国籍同龄，正向纽带应抵消掉竞争
const compatriotGk = { ...benchGk, nationality: "ENG", age: 32 };
assert.ok(
  playerBond(compatriotGk, starterGk) > benchView,
  "shared nationality and age must soften a positional rivalry"
);

const rivalFrictions = dressingRoomFrictions(
  { ...club, players: [...club.players, starterGk, benchGk] },
  world
);
assert.ok(
  rivalFrictions.some(
    (f) =>
      (f.aId === starterGk.id && f.bId === benchGk.id) ||
      (f.aId === benchGk.id && f.bId === starterGk.id)
  ),
  "the rival keepers must be reported as friction"
);
for (const friction of rivalFrictions) {
  assert.ok(friction.bond <= BOND_FRICTION, "reported friction must be below the threshold");
  assert.notEqual(friction.aId, friction.bId, "a player cannot clash with himself");
}
assert.ok(BOND_ALLY > 0 && BOND_FRICTION < 0, "thresholds must sit on opposite sides of neutral");

// ── 和谐度：范围、确定性，且想走的人越多越低 ──
const harmony = dressingRoomHarmony(club, world);
assert.ok(harmony >= 0 && harmony <= 100, "harmony stays in range");
assert.equal(dressingRoomHarmony(club, world), harmony, "harmony must be deterministic");
assert.ok(harmonyLabel(harmony, "zh").length > 0 && harmonyLabel(harmony, "en").length > 0);
club.players[0].wantsTransfer = true;
club.players[1].wantsTransfer = true;
assert.ok(
  dressingRoomHarmony(club, world) < harmony,
  "players wanting out must lower harmony"
);
delete club.players[0].wantsTransfer;
delete club.players[1].wantsTransfer;

// ── 每日推进只返回信箱草稿，绝不写入能力或胜率修正 ──
const before = club.players.map((p) => ({ ovr: p.ovr, attrs: JSON.stringify(p.attrs) }));
const draft = processDressingRoomDay(world);
club.players.forEach((p, i) => {
  assert.equal(p.ovr, before[i].ovr, "dressing-room processing must not change ability");
  assert.equal(JSON.stringify(p.attrs), before[i].attrs, "dressing-room processing must not change attributes");
});
assert.equal(typeof club._harmony, "number", "harmony is published for the UI");
if (draft) {
  assert.ok(draft.inboxDraft?.dedupeKey, "inbox drafts need a dedupe key");
  assert.ok(draft.inboxDraft.actions?.length, "inbox drafts need actions");
}

// 待业 / 赛季结束不应产生更衣室事件
assert.equal(processDressingRoomDay({ ...world, sacked: true }), null);
assert.equal(processDressingRoomDay({ ...world, seasonOver: true }), null);

// ── 转会申请：只在连续违约 + 关系恶劣时递交，且同赛季不重复 ──
const rebel = club.players[3];
rebel.wantsTransfer = true;
rebel.relation = -2;
const rebelPath = ensurePlayerPathway(rebel, club, world);
rebelPath.breaches = 2;
const requestOut = processDressingRoomDay(world);
assert.ok(requestOut?.inboxDraft, "an unhappy player with broken promises must hand in a request");
assert.equal(requestOut.inboxDraft.ref.kind, "transfer_request");
assert.equal(requestOut.inboxDraft.ref.playerId, rebel.id);
assert.equal(hasPendingTransferRequest(rebel), true, "the request is recorded on the player");
assert.ok(
  requestOut.inboxDraft.actions.some((a) => a.id === "grant_request"),
  "the manager must be able to accept the request"
);
// 同一赛季不再重复递交
const repeat = processDressingRoomDay(world);
assert.ok(
  !repeat?.inboxDraft || repeat.inboxDraft.ref.playerId !== rebel.id,
  "a player must not hand in two requests in the same season"
);
// 关系尚可的球员不会递交
const settled = club.players[4];
settled.wantsTransfer = true;
settled.relation = 1;
ensurePlayerPathway(settled, club, world).breaches = 2;
assert.equal(
  hasPendingTransferRequest(settled),
  false,
  "a player on good terms with the manager does not hand in a request"
);
delete settled.wantsTransfer;

// 转会申请必须让买家更容易问价（poaching 读取同一份状态）
const poachSource = readFileSync(resolve(repo, "js/poaching.js"), "utf8");
assert.match(
  poachSource,
  /transferRequest\?\.status === "pending"/,
  "the transfer market must read pending transfer requests"
);

// ── 源码约束：不得向比赛写入隐藏修正 ──
assert.doesNotMatch(source, /\.ovr\s*[+\-*/]?=/, "must not write player ability");
assert.doesNotMatch(source, /attrs\.\w+\s*[+\-*/]?=/, "must not write player attributes");

console.log(
  JSON.stringify(
    {
      squad: club.players.length,
      leaders: leaders.length,
      factions: factions.length,
      factionSizes: factions.map((f) => f.size),
      frictionsAtKickoff,
      frictionsWithRivalry: rivalFrictions.length,
      harmony,
      harmonyLabel: harmonyLabel(harmony, "zh"),
    },
    null,
    2
  )
);
console.log("Dressing-room audit passed: derived bonds, stable leaders, disjoint factions, no hidden modifiers");
