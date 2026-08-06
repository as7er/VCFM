import assert from "node:assert/strict";

import { processContractsEndOfSeason } from "../js/contracts.js";
import { arrangeAiLoan } from "../js/loans.js";
import {
  ensureClubSquadPlan,
  evaluateRecruitmentCandidate,
  evaluateYouthCandidate,
  selectPlannedRecruitmentPosition,
  selectPlannedSaleCandidate,
} from "../js/squad-planning.js";

function player(id, pos, ovr = 12, age = 25, options = {}) {
  const attrs = {
    reflexes: ovr,
    handling: ovr,
    positioning: ovr,
    kicking: ovr,
    tackling: ovr,
    marking: ovr,
    strength: ovr,
    pace: ovr,
    passing: ovr,
    vision: ovr,
    stamina: ovr,
    shooting: ovr,
    dribbling: ovr,
    finishing: ovr,
    heading: ovr,
    crossing: ovr,
    decisions: ovr,
  };
  return {
    id,
    name: `Player ${id}`,
    pos,
    age,
    nationality: options.nationality || "ENG",
    attrs,
    ovr,
    potential: options.potential ?? Math.min(20, ovr + 1),
    value: options.value ?? ovr * 100_000,
    wage: options.wage ?? ovr * 500,
    contractYears: options.contractYears ?? 3,
    fitness: 100,
    morale: 70,
    injured: 0,
    suspendedMatches: 0,
    stats: {},
    history: [],
    fromYouth: !!options.fromYouth,
  };
}

function club(id, formation = "4-3-3", division = 1) {
  return {
    id,
    name: `Club ${id}`,
    short: id,
    division,
    countryId: "crownland",
    countryCode: "ENG",
    power: 70,
    money: 50_000_000,
    players: [],
    youth: { level: 3, players: [] },
    facilities: { stadium: 2, training: 2, youth: 3, projects: [] },
    staff: {},
    finance: {},
    tactics: { formation, lineup: [], roles: [] },
  };
}

function addSquad(target, counts, prefix = target.id, base = 12) {
  for (const [position, count] of Object.entries(counts)) {
    for (let index = 0; index < count; index++) {
      const candidate = player(`${prefix}_${position}_${index}`, position, base + (index % 3), 24 + (index % 4));
      candidate.clubId = target.id;
      target.players.push(candidate);
    }
  }
}

function worldWith(...clubs) {
  return {
    season: 2026,
    day: 3,
    seasonOver: false,
    sacked: false,
    userClubId: clubs[0].id,
    clubs,
    loans: [],
    freeAgents: [],
    news: [],
    table: Object.fromEntries(clubs.map((item) => [item.id, { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }])),
    transferWindow: { summerStart: 1, summerEnd: 40, winterStart: 110, winterEnd: 145 },
  };
}

// Formation requirements drive ideal depth and the stored plan is deterministic.
{
  const home = club("home", "4-2-3-1");
  const peer = club("peer", "4-3-3");
  addSquad(home, { GK: 2, DEF: 7, MID: 7, ATT: 2 });
  addSquad(peer, { GK: 2, DEF: 7, MID: 6, ATT: 4 }, "peer", 13);
  const world = worldWith(home, peer);
  const first = ensureClubSquadPlan(world, home);
  const second = ensureClubSquadPlan(world, home);
  assert.equal(first, second, "unchanged facts should reuse the persisted plan");
  assert.equal(first.positions.MID.slots, 5);
  assert.equal(first.positions.MID.ideal, 9);
  assert.equal(first.positions.ATT.slots, 1);
  assert.equal(first.positions.ATT.ideal, 2);
  assert.equal(first.formation, "4-2-3-1");
}

// Expiring contracts and ageing starters create future risk even when today's headcount looks adequate.
{
  const home = club("future");
  const peer = club("future_peer");
  addSquad(home, { GK: 2, DEF: 7, MID: 5, ATT: 5 }, "future", 12);
  addSquad(peer, { GK: 2, DEF: 7, MID: 5, ATT: 5 }, "future_peer", 13);
  home.players.filter((candidate) => candidate.pos === "ATT").forEach((candidate, index) => {
    if (index < 2) candidate.contractYears = 1;
  });
  const aged = home.players
    .filter((candidate) => candidate.pos === "DEF")
    .sort((a, b) => b.ovr - a.ovr)[0];
  aged.age = 33;
  aged.contractYears = 3;
  const world = worldWith(home, peer);
  const plan = ensureClubSquadPlan(world, home);
  assert.ok(plan.positions.ATT.securedNext < plan.positions.ATT.current);
  assert.ok(plan.positions.ATT.reasons.some((reason) => reason.includes("合同")));
  assert.equal(plan.playerDecisions[aged.id].action, "replace");
}

// Sales only come from a real surplus and never remove the positional minimum.
{
  const home = club("seller");
  const peer = club("seller_peer");
  addSquad(home, { GK: 2, DEF: 10, MID: 5, ATT: 5 }, "seller", 12);
  addSquad(peer, { GK: 2, DEF: 7, MID: 5, ATT: 5 }, "seller_peer", 12);
  const weak = home.players.filter((candidate) => candidate.pos === "DEF").at(-1);
  weak.ovr = 7;
  weak.attrs = Object.fromEntries(Object.keys(weak.attrs).map((key) => [key, 7]));
  weak.age = 30;
  const world = worldWith(home, peer);
  const selected = selectPlannedSaleCandidate(world, home);
  assert.equal(selected?.id, weak.id);
  home.players = home.players.filter((candidate) => candidate.pos !== "DEF" || candidate.id === weak.id).slice(0, 4);
  home.squadPlan = null;
  assert.equal(selectPlannedSaleCandidate(world, home), null, "minimum depth must be protected");
}

// Recruitment follows the highest structural need and rewards actual quality, upside and registration value.
{
  const home = club("buyer");
  const peer = club("buyer_peer");
  addSquad(home, { GK: 2, DEF: 7, MID: 5, ATT: 2 }, "buyer", 11);
  addSquad(peer, { GK: 2, DEF: 7, MID: 5, ATT: 5 }, "buyer_peer", 13);
  const world = worldWith(home, peer);
  assert.equal(selectPlannedRecruitmentPosition(world, home), "ATT");
  const young = player("young_target", "ATT", 14, 21, { potential: 18 });
  const old = player("old_target", "ATT", 11, 33, { potential: 11 });
  assert.ok(
    evaluateRecruitmentCandidate(world, home, young).score > evaluateRecruitmentCandidate(world, home, old).score
  );
}

// AI renews a needed expiring player and releases an expiring surplus player from the same plan.
{
  const user = club("user");
  addSquad(user, { GK: 2, DEF: 7, MID: 5, ATT: 5 }, "user", 12);
  const ai = club("contract_ai");
  addSquad(ai, { GK: 2, DEF: 10, MID: 5, ATT: 3 }, "contract_ai", 12);
  const weak = ai.players.filter((candidate) => candidate.pos === "DEF").at(-1);
  weak.ovr = 7;
  weak.attrs = Object.fromEntries(Object.keys(weak.attrs).map((key) => [key, 7]));
  weak.contractYears = 1;
  const needed = ai.players.find((candidate) => candidate.pos === "ATT");
  needed.contractYears = 1;
  const world = worldWith(user, ai);
  processContractsEndOfSeason(world);
  assert.ok(ai.players.some((candidate) => candidate.id === needed.id && candidate.contractYears > 0));
  assert.equal(ai.players.some((candidate) => candidate.id === weak.id), false);
  assert.ok(world.freeAgents.some((candidate) => candidate.id === weak.id));
}

// Youth promotion and AI-to-AI loans both require an actual first-team need at the destination.
{
  const parent = club("parent");
  const host = club("host");
  addSquad(parent, { GK: 2, DEF: 7, MID: 8, ATT: 5 }, "parent", 13);
  addSquad(host, { GK: 2, DEF: 7, MID: 3, ATT: 5 }, "host", 10);
  const world = worldWith(parent, host);
  const prospect = player("prospect", "MID", 11, 20, { potential: 17, fromYouth: true });
  prospect.clubId = parent.id;
  parent.players.push(prospect);
  const parentPlan = ensureClubSquadPlan(world, parent, { force: true });
  assert.equal(parentPlan.playerDecisions[prospect.id].action, "loan");
  const academyPlayer = player("academy", "MID", 12, 19, { potential: 17, fromYouth: true });
  academyPlayer.clubId = host.id;
  assert.equal(evaluateYouthCandidate(world, host, academyPlayer).promote, true);
  const loan = arrangeAiLoan(world, parent, host, prospect, {
    term: "season",
    fee: 25_000,
    wageShare: 0.75,
  });
  assert.equal(loan.ok, true);
  assert.equal(parent.players.some((candidate) => candidate.id === prospect.id), false);
  assert.equal(host.players.some((candidate) => candidate.id === prospect.id), true);
  assert.equal(prospect.loan.parentClubId, parent.id);
  assert.ok(world.loans.some((record) => record.playerId === prospect.id));
  assert.equal(parent.money, 50_025_000);
  assert.equal(host.money, 49_975_000);
}

console.log("squad planning audit passed");
