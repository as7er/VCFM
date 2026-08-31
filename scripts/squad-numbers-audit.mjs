import assert from "node:assert/strict";
import {
  SQUAD_NUMBER_VERSION,
  assignSquadNumbers,
  ensurePlayerNumberPreferences,
  evaluateSquadNumberCandidate,
  registerSquadNumbers,
  setSquadNumber,
} from "../js/squad-numbers.js";

function player(id, pos, primary, ovr, preferences = null, strength = "normal") {
  const result = {
    id,
    name: id,
    pos,
    age: 25,
    ovr,
    number: null,
    positionProfile: { version: 1, primary, natural: [primary], ratings: { [primary]: 16 } },
  };
  if (preferences) {
    result.numberPreferences = preferences;
    result.numberPreferenceStrength = strength;
    result.numberPreferenceVersion = SQUAD_NUMBER_VERSION;
  }
  return result;
}

function club(players, youth = []) {
  return {
    id: "club",
    players,
    youth: { players: youth },
    tactics: { lineup: players.slice(0, 11).map((item) => item.id), corePlayerId: null, captainId: null },
    numberRegistration: null,
  };
}

// 偏好是球员稳定身份，不消耗随机数，也不会在重复 ensure 时漂移。
const identity = player("identity", "ATT", "ST", 15);
assert.equal(ensurePlayerNumberPreferences(identity), true);
const firstPreference = JSON.stringify(identity.numberPreferences);
assert.equal(ensurePlayerNumberPreferences(identity), false);
assert.equal(JSON.stringify(identity.numberPreferences), firstPreference);
assert.ok(identity.numberPreferences.length >= 3);
assert.ok(["light", "normal", "strong"].includes(identity.numberPreferenceStrength));

// 初始登记由位置、偏好和公开地位共同决定。
const gk = player("gk", "GK", "GK", 16, [1, 13, 23], "strong");
const striker = player("striker", "ATT", "ST", 17, [9, 19, 10], "strong");
const creator = player("creator", "MID", "AM", 18, [10, 8, 20], "strong");
const rightWing = player("right-wing", "ATT", "RW", 16, [7, 11, 17], "normal");
const leftWing = player("left-wing", "ATT", "LW", 16, [11, 7, 17], "normal");
const midfield = player("midfield", "MID", "CM", 15, [8, 6, 18], "normal");
const defenders = [
  player("rb", "DEF", "RB", 14, [2, 22, 14]),
  player("lb", "DEF", "LB", 14, [3, 12, 26]),
  player("cb1", "DEF", "CB", 15, [4, 5, 15]),
  player("cb2", "DEF", "CB", 14, [5, 4, 15]),
];
const initial = club([gk, striker, creator, rightWing, leftWing, midfield, ...defenders]);
initial.tactics.corePlayerId = creator.id;
assignSquadNumbers(initial, { season: 2026, day: 1, reason: "audit" });
assert.equal(gk.number, 1, "第一门将应优先取得 1 号");
assert.equal(striker.number, 9, "主力中锋应优先取得 9 号");
assert.equal(creator.number, 10, "进攻核心应优先取得 10 号");
assert.equal(rightWing.number, 7, "右边锋应优先取得 7 号");
assert.equal(leftWing.number, 11, "左边锋应优先取得 11 号");
assert.equal(new Set(initial.players.map((item) => item.number)).size, initial.players.length);
assert.equal(initial.numberRegistration.season, 2026);
assert.equal(initial.numberRegistration.entries.creator, 10);

const creatorTen = evaluateSquadNumberCandidate(initial, creator, 10);
assert.ok(creatorTen.reasons.includes("favorite"));
assert.ok(creatorTen.reasons.includes("position-tradition"));
assert.ok(creatorTen.reasons.includes("core-player"));

// 上季合法持有人受保护；核心不能直接抢走仍有人使用的 10 号。
const holder = player("holder", "MID", "AM", 13, [10, 20, 18]);
holder.number = 10;
const protectedCore = player("protected-core", "MID", "AM", 19, [10, 17, 8], "strong");
protectedCore.number = 17;
const protectedClub = club([holder, protectedCore]);
protectedClub.tactics.corePlayerId = protectedCore.id;
protectedClub.numberRegistration = {
  version: SQUAD_NUMBER_VERSION,
  season: 2026,
  entries: { holder: 10, "protected-core": 17 },
  youthEntries: {},
};
registerSquadNumbers(protectedClub, { season: 2027, day: 1, reason: "new-season" });
assert.equal(holder.number, 10);
assert.equal(protectedCore.number, 17);

// 10 号持有人离队后，钟情 10 号的绝对核心在新赛季登记时主动换号。
protectedClub.players = [protectedCore];
protectedClub.tactics.lineup = [protectedCore.id];
protectedClub.numberRegistration = {
  version: SQUAD_NUMBER_VERSION,
  season: 2027,
  entries: { "protected-core": 17, holder: 10 },
  youthEntries: {},
};
const released = registerSquadNumbers(protectedClub, { season: 2028, day: 1, reason: "new-season" });
assert.equal(protectedCore.number, 10);
assert.deepEqual(released.changes, [{ playerId: protectedCore.id, name: protectedCore.name, from: 17, to: 10 }]);

// 归队/新援不受上季号码保护，按偏好竞争核心释放后的空号。
const newcomer = player("newcomer", "ATT", "ST", 16, [9, 19, 27], "strong");
protectedClub.players.push(newcomer);
protectedClub.tactics.lineup.push(newcomer.id);
registerSquadNumbers(protectedClub, {
  season: 2029,
  day: 1,
  reason: "new-season",
  protectedEntries: { "protected-core": 10 },
});
assert.equal(protectedCore.number, 10);
assert.equal(newcomer.number, 9);

// 旧档重复号码必须修复；学院号码限制在 40–99 且全俱乐部不重复。
const duplicateA = player("duplicate-a", "DEF", "CB", 16, [4, 5, 15]);
const duplicateB = player("duplicate-b", "DEF", "CB", 12, [5, 4, 15]);
duplicateA.number = 4;
duplicateB.number = 4;
const youthA = player("youth-a", "MID", "CM", 10, [8, 18, 40]);
const youthB = player("youth-b", "ATT", "ST", 10, [9, 19, 41]);
youthA.number = 4;
youthB.number = 4;
const repaired = club([duplicateA, duplicateB], [youthA, youthB]);
assignSquadNumbers(repaired, { season: 2026, reason: "migration" });
assert.notEqual(duplicateA.number, duplicateB.number);
assert.ok(repaired.youth.players.every((item) => item.number >= 40 && item.number <= 99));
assert.equal(new Set([...repaired.players, ...repaired.youth.players].map((item) => item.number)).size, 4);

// 手动换号使用同一登记事实；目标被占时默认交换，不能制造重号。
const oldA = duplicateA.number;
const oldB = duplicateB.number;
const swap = setSquadNumber(repaired, duplicateA.id, oldB, { season: 2026, day: 4 });
assert.equal(swap.ok, true);
assert.equal(duplicateA.number, oldB);
assert.equal(duplicateB.number, oldA);
assert.equal(repaired.numberRegistration.entries[duplicateA.id], oldB);

console.log(JSON.stringify({
  initial: Object.fromEntries(initial.players.map((item) => [item.id, item.number])),
  releasedCore: released.changes,
  repaired: Object.fromEntries([...repaired.players, ...repaired.youth.players].map((item) => [item.id, item.number])),
}, null, 2));
console.log("squad numbers audit passed");
