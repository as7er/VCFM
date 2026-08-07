import assert from "node:assert/strict";

import { SimEngine } from "../js/sim/engine.js";

function makeClub(id, rating = 12) {
  const roles = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
  const players = roles.map((pos, index) => ({
    id: `${id}-p${index}`,
    name: `${id}-${index}`,
    pos,
    number: index + 1,
    fitness: 100,
    attrs: {
      pace: rating,
      shooting: rating,
      passing: rating,
      dribbling: rating,
      defending: rating,
      physical: rating,
      finishing: rating,
      tackling: rating,
      marking: rating,
      strength: rating,
      stamina: rating,
      vision: rating,
      reflexes: rating,
      handling: rating,
      positioning: rating,
      kicking: rating,
      decisions: rating,
    },
  }));
  return {
    id,
    name: id,
    players,
    tactics: {
      formation: "4-3-3",
      lineup: players.map((player) => player.id),
      pressing: 3,
      tempo: 3,
      defensiveLine: 3,
      style: "balanced",
    },
  };
}

function makeEngine(random = () => 0.5) {
  return new SimEngine(makeClub("home"), makeClub("away"), { random });
}

function centralAttacker(engine, team = "home") {
  return engine.agents
    .filter((agent) => agent.team === team && agent.role === "ATT")
    .sort((a, b) => Math.abs(a.x - 50) - Math.abs(b.x - 50))[0];
}

function moveOtherPlayersAway(engine, keep) {
  for (const agent of engine.agents) {
    if (keep.has(agent.id)) continue;
    agent.x = agent.team === "home" ? 82 : 18;
    agent.y = 50;
    agent.tx = agent.x;
    agent.ty = agent.y;
    agent.vx = 0;
    agent.vy = 0;
  }
}

// 空门是射门前即可见的几何事实，且近距离机会不受此前一次射门的球队冷却压制。
{
  const engine = makeEngine(() => 0.5);
  const attacker = centralAttacker(engine);
  const goalkeeper = engine._teamGk("away");
  moveOtherPlayersAway(engine, new Set([attacker.id, goalkeeper.id]));
  engine.t = 100;
  engine.deadBallUntil = 0;
  engine._teamAttackSince.home = engine.t;
  engine._teamShotUntil.home = engine.t + 600;
  attacker.x = 50;
  attacker.y = 9;
  attacker.tx = attacker.x;
  attacker.ty = attacker.y;
  attacker.shotCdUntil = 0;
  goalkeeper.x = 25;
  goalkeeper.y = 5;
  goalkeeper.tx = goalkeeper.x;
  goalkeeper.ty = goalkeeper.y;
  engine.ball.owner = attacker.id;
  engine.ball.state = "held";
  engine.ball.x = attacker.x;
  engine.ball.y = attacker.y;
  engine.ball.vx = 0;
  engine.ball.vy = 0;

  const opportunity = engine._goalOpportunity(attacker);
  assert.equal(opportunity.clearOpenGoal, true, "displaced goalkeeper exposes the goal before the shot decision");
  engine._decideOnBall(attacker);
  const shot = engine.events.find((event) => event.type === "shot" && event.agentId === attacker.id);
  assert.ok(shot, "close open goal produces a shot despite the team shot cooldown");
  assert.equal(shot.openGoal, true, "shot event reads the same open-goal fact as the decision");
  assert.equal(engine.ball.state, "shot", "the ball leaves the attacker's control as a shot");
}

// 出击中的门将仍在射门线路上时不是空门，避免把正常单刀封角误判成空门。
{
  const engine = makeEngine();
  const attacker = centralAttacker(engine);
  const goalkeeper = engine._teamGk("away");
  attacker.x = 50;
  attacker.y = 10;
  goalkeeper.x = 50;
  goalkeeper.y = 5;
  const opportunity = engine._goalOpportunity(attacker);
  assert.equal(opportunity.openGoal, false, "a goalkeeper between shooter and goal still covers the lane");
}

// 门将出击是独立救险，不需要等待普通球队抢断的 6.5 秒组织窗口。
{
  const engine = makeEngine(() => 0);
  const attacker = centralAttacker(engine);
  const goalkeeper = engine._teamGk("away");
  moveOtherPlayersAway(engine, new Set([attacker.id, goalkeeper.id]));
  engine.t = 200;
  engine.deadBallUntil = 0;
  engine._teamAttackSince.home = engine.t - 1;
  engine._teamTackleUntil.away = engine.t + 100;
  attacker.x = 50;
  attacker.y = 8;
  attacker.protectUntil = 0;
  attacker.vx = 0;
  attacker.vy = -1;
  goalkeeper.x = 50;
  goalkeeper.y = 6;
  goalkeeper.challengeCdUntil = 0;
  engine.ball.owner = attacker.id;
  engine.ball.state = "held";
  engine.ball.x = attacker.x;
  engine.ball.y = attacker.y;
  engine.ball.vx = attacker.vx;
  engine.ball.vy = attacker.vy;
  engine.ball.settleUntil = 0;

  engine._resolvePossession(0.1);
  assert.equal(engine.ball.owner, goalkeeper.id, "goalkeeper can smother at an attacker's feet");
  assert.ok(
    engine.events.some((event) => event.type === "gk_claim" && event.agentId === goalkeeper.id),
    "goalkeeper claim is recorded as its own causal event"
  );
  assert.equal(
    engine.events.some((event) => event.type === "save"),
    false,
    "smothering a dribbler is not miscounted as a shot save"
  );
}

// 深入六码区时门将目标仍须位于球门与持球者之间，不能主动跑到球后方。
{
  const engine = makeEngine();
  const attacker = centralAttacker(engine);
  const goalkeeper = engine._teamGk("away");
  attacker.x = 50;
  attacker.y = 3;
  engine.ball.owner = attacker.id;
  engine.ball.state = "held";
  engine.ball.x = attacker.x;
  engine.ball.y = attacker.y;

  engine._thinkGK(goalkeeper, attacker);
  assert.ok(
    goalkeeper.ty > 0 && goalkeeper.ty < attacker.y,
    `goalkeeper stays goal-side of a close dribbler (target y=${goalkeeper.ty})`
  );
}

// 下方球门使用完全镜像的因果，避免只修正主队进攻方向。
{
  const engine = makeEngine();
  const attacker = centralAttacker(engine, "away");
  const goalkeeper = engine._teamGk("home");
  attacker.x = 50;
  attacker.y = 97;
  engine.ball.owner = attacker.id;
  engine.ball.state = "held";
  engine.ball.x = attacker.x;
  engine.ball.y = attacker.y;

  engine._thinkGK(goalkeeper, attacker);
  assert.ok(
    goalkeeper.ty < 100 && goalkeeper.ty > attacker.y,
    `home goalkeeper stays goal-side of a close dribbler (target y=${goalkeeper.ty})`
  );
}

// 门将未能抱稳时仍可用身体挡出松球，不能把每次失败都变成被轻松过掉。
{
  const engine = makeEngine();
  const attacker = centralAttacker(engine);
  const goalkeeper = engine._teamGk("away");
  moveOtherPlayersAway(engine, new Set([attacker.id, goalkeeper.id]));
  engine.t = 240;
  engine.deadBallUntil = 0;
  engine._teamAttackSince.home = engine.t - 1;
  attacker.x = 50;
  attacker.y = 8;
  attacker.protectUntil = 0;
  attacker.vx = 0;
  attacker.vy = -1;
  goalkeeper.x = 50;
  goalkeeper.y = 6;
  goalkeeper.challengeCdUntil = 0;
  engine.ball.owner = attacker.id;
  engine.ball.state = "held";
  engine.ball.x = attacker.x;
  engine.ball.y = attacker.y;
  engine.ball.vx = attacker.vx;
  engine.ball.vy = attacker.vy;
  engine.ball.settleUntil = 0;
  const rolls = [0.99, 0, 0.5, 0.5, 0.5];
  engine.random = () => rolls.shift() ?? 0.5;

  engine._resolvePossession(0.1);
  assert.equal(engine.ball.owner, null, "body block releases the ball instead of awarding possession");
  assert.equal(engine.ball.state, "loose", "body block creates a contestable loose ball");
  assert.ok(
    engine.events.some((event) => event.type === "gk_block" && event.agentId === goalkeeper.id),
    "goalkeeper body block is recorded separately from a save"
  );
}

// 飞行中的射门按速度投影门线落点，门将不再只追当前球坐标。
{
  const engine = makeEngine();
  const goalkeeper = engine._teamGk("away");
  goalkeeper.x = 50;
  goalkeeper.y = 5;
  engine.ball.owner = null;
  engine.ball.state = "shot";
  engine.ball.kickTeam = "home";
  engine.ball.x = 36;
  engine.ball.y = 16;
  engine.ball.vx = 20;
  engine.ball.vy = -40;

  engine._thinkGK(goalkeeper, null);
  assert.equal(goalkeeper.fsm, "save", "goalkeeper enters the shot-reaction state");
  assert.ok(
    goalkeeper.tx > 46 && goalkeeper.tx < 49,
    `goalkeeper reacts toward the projected goal-line crossing (got ${goalkeeper.tx})`
  );
}

console.log("goalkeeper/open-goal audit passed");
