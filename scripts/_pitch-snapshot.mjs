/**
 * 比赛画面快照工具（临时诊断用，不进 verify）。
 *
 * 目的：把 SimEngine 的真实输出画成 2D 球场图，用来肉眼判断"哪些画面不像球"。
 * 与 sim-viewer.html 的区别是这里按**真实尺寸**画场地线（禁区 40.32×16.5 米、
 * 小禁区 18.32×5.5 米、中圈半径 9.15 米），因此看到的禁区就是引擎判定的禁区。
 *
 * 用法：node scripts/_pitch-snapshot.mjs
 * 产物：artifacts/pitch-<scene>.png
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

import { SimEngine, SIM } from "../js/sim/engine.js";

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function makeClub(name, ability) {
  const roles = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
  const players = roles.map((pos, index) => {
    const variance = ((index * 7 + ability) % 5) - 2;
    const rating = Math.max(1, Math.min(20, ability + variance));
    const id = `${name}-p${index}`;
    const attrs = {};
    for (const key of [
      "pace", "shooting", "passing", "dribbling", "defending", "physical", "finishing",
      "tackling", "marking", "strength", "stamina", "vision", "reflexes", "handling",
      "positioning", "kicking", "decisions",
    ]) attrs[key] = rating;
    return { id, name: id, pos, number: index + 1, fitness: 100, attrs };
  });
  return {
    id: name, name, players,
    tactics: {
      formation: "4-3-3", lineup: players.map((p) => p.id),
      pressing: 3, tempo: 3, defensiveLine: 3, style: "balanced",
    },
  };
}

// ── 采样：跑一场，按场景条件录连续帧 ──
const FRAMES_PER_SCENE = 6;
const FRAME_STRIDE = 5; // 每 5 tick = 0.5 秒

const scenes = {
  "box-defence": {
    label: "对方在我方禁区内持球（防守贴身）",
    test: (e) => {
      const b = e.ball;
      if (!b.owner) return false;
      const o = e.agents.find((a) => a.id === b.owner);
      if (!o || o.role === "GK") return false;
      // 真实禁区：宽 40.32m → x 20.35..79.65，深 16.5m → y<15.7 或 y>84.3
      return b.x > 20.35 && b.x < 79.65 && (b.y < 15.7 || b.y > 84.3);
    },
  },
  "settled-defence": {
    label: "阵地防守（球在我方半场，非禁区）",
    test: (e) => {
      const b = e.ball;
      if (!b.owner || b.restartType) return false;
      const o = e.agents.find((a) => a.id === b.owner);
      if (!o || o.role === "GK") return false;
      return b.y > 55 && b.y < 84 && Math.hypot(o.vx || 0, o.vy || 0) > 1;
    },
  },
  transition: {
    label: "由守转攻（抢断/拦截后）",
    test: (e) => e._sceneTurnover === true,
  },
  corner: {
    label: "角球摆位",
    test: (e) => e.ball.restartType === "corner",
  },
  buildup: {
    label: "后场组织（门将/后卫出球）",
    test: (e) => {
      const b = e.ball;
      if (!b.owner) return false;
      const o = e.agents.find((a) => a.id === b.owner);
      return !!o && (o.role === "GK" || (o.role === "DEF" && b.y > 78));
    },
  },
};

function grab(engine, sceneKey) {
  const jobsHome = engine._defPlans?.home?.jobs;
  const jobsAway = engine._defPlans?.away?.jobs;
  return {
    t: Number(engine.t.toFixed(1)),
    score: { ...engine.score },
    ball: { x: engine.ball.x, y: engine.ball.y, owner: engine.ball.owner, restartType: engine.ball.restartType || null },
    players: engine.agents.filter((a) => !a.sentOff).map((a) => ({
      id: a.id, num: a.num ?? a.number ?? 0, team: a.team, role: a.role,
      x: a.x, y: a.y, tx: a.tx, ty: a.ty, heading: a.heading,
      speed: Math.hypot(a.vx || 0, a.vy || 0),
      fsm: a.fsm || null,
      job: (a.team === "home" ? jobsHome : jobsAway)?.get?.(a.id)?.type || null,
      hasBall: engine.ball.owner === a.id,
    })),
    scene: sceneKey,
  };
}

const captured = {};
for (const key of Object.keys(scenes)) captured[key] = [];

const original = Math.random;
Math.random = seededRandom(20260829);
try {
  const engine = new SimEngine(makeClub("HOME", 14), makeClub("AWAY", 12), {
    simulationProfile: "standard", timeStep: SIM.DT, separationPasses: 8,
  });
  let recording = null;
  let lastOwnerTeam = null;

  const steps = Math.round((90 * 60) / SIM.DT);
  for (let i = 0; i < steps; i++) {
    const beforeOwner = engine.ball.owner;
    engine.step(SIM.DT);

    // 转换检测：持球方换队
    const o = engine.ball.owner ? engine.agents.find((a) => a.id === engine.ball.owner) : null;
    engine._sceneTurnover = !!(o && lastOwnerTeam && o.team !== lastOwnerTeam && beforeOwner !== engine.ball.owner);
    if (o) lastOwnerTeam = o.team;

    if (recording) {
      if (i >= recording.nextAt) {
        captured[recording.key].push(grab(engine, recording.key));
        recording.nextAt = i + FRAME_STRIDE;
        if (captured[recording.key].length >= FRAMES_PER_SCENE * recording.take) recording = null;
      }
      continue;
    }
    for (const [key, scene] of Object.entries(scenes)) {
      if (captured[key].length >= FRAMES_PER_SCENE) continue;
      if (!scene.test(engine)) continue;
      recording = { key, nextAt: i, take: 1 };
      break;
    }
  }
} finally {
  Math.random = original;
}

for (const [key, frames] of Object.entries(captured)) {
  console.log(`${key}: ${frames.length} frames${frames.length ? ` @ t=${frames[0].t}s` : " (NOT FOUND)"}`);
}

// ── 渲染 ──
const html = (frames, label) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#0b1220;color:#e5e7eb;font:13px system-ui,"Microsoft YaHei",sans-serif;padding:14px}
h1{font-size:15px;margin:0 0 10px}
.grid{display:grid;grid-template-columns:repeat(3,340px);gap:10px}
.cell{position:relative}
.cap{font-size:11px;color:#94a3b8;padding:2px 0}
canvas{background:#15803d;border-radius:6px;display:block}
</style></head><body>
<h1>${label}</h1><div class="grid" id="g"></div>
<script>
(function(){
const FRAMES = ${JSON.stringify(frames)};
const W = 340, H = Math.round(340 * 105 / 68);
// 真实尺寸（米）→ 归一化坐标 0..100
const M = { pitchW: 68, pitchH: 105, boxW: 40.32, boxD: 16.5, sixW: 18.32, sixD: 5.5, circleR: 9.15, spot: 11, goalW: 7.32 };
const nx = (m) => (m / M.pitchW) * 100, ny = (m) => (m / M.pitchH) * 100;
const px = (x) => (x / 100) * W, py = (y) => (y / 100) * H;

function pitch(ctx) {
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle = "rgba(255,255,255,.42)"; ctx.lineWidth = 1.2;
  ctx.strokeRect(px(0.5), py(0.5), px(99)-px(0.5), py(99)-py(0.5));
  ctx.beginPath(); ctx.moveTo(px(0.5), H/2); ctx.lineTo(px(99.5), H/2); ctx.stroke();
  // 中圈：x/y 缩放不同 → 椭圆
  ctx.beginPath(); ctx.ellipse(W/2, H/2, px(nx(M.circleR)), py(ny(M.circleR)), 0, 0, Math.PI*2); ctx.stroke();
  for (const near of [true,false]) {
    const bw = nx(M.boxW), bd = ny(M.boxD), sw = nx(M.sixW), sd = ny(M.sixD);
    const y0 = near ? 0 : 100 - bd;
    ctx.strokeRect(px(50-bw/2), py(y0), px(bw)-px(0), py(bd)-py(0));
    const sy0 = near ? 0 : 100 - sd;
    ctx.strokeRect(px(50-sw/2), py(sy0), px(sw)-px(0), py(sd)-py(0));
    // 点球点
    const spotY = near ? ny(M.spot) : 100 - ny(M.spot);
    ctx.beginPath(); ctx.arc(px(50), py(spotY), 2, 0, Math.PI*2); ctx.fillStyle="rgba(255,255,255,.55)"; ctx.fill();
    // 球门
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    const gw = nx(M.goalW);
    ctx.beginPath(); ctx.moveTo(px(50-gw/2), py(near?0.5:99.5)); ctx.lineTo(px(50+gw/2), py(near?0.5:99.5)); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.42)"; ctx.lineWidth = 1.2;
  }
}

function drawFrame(ctx, f) {
  pitch(ctx);
  // 目标线：引擎意图
  for (const p of f.players) {
    ctx.strokeStyle = p.team === "home" ? "rgba(147,197,253,.45)" : "rgba(252,165,165,.45)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px(p.x), py(p.y)); ctx.lineTo(px(p.tx), py(p.ty)); ctx.stroke();
    ctx.fillStyle = p.team === "home" ? "rgba(147,197,253,.5)" : "rgba(252,165,165,.5)";
    ctx.beginPath(); ctx.arc(px(p.tx), py(p.ty), 1.8, 0, Math.PI*2); ctx.fill();
  }
  for (const p of f.players) {
    const x = px(p.x), y = py(p.y), r = 8;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = p.role === "GK" ? (p.team==="home"?"#1e3a8a":"#7f1d1d") : (p.team==="home"?"#3b82f6":"#ef4444");
    ctx.fill();
    ctx.strokeStyle = p.hasBall ? "#fde047" : "rgba(255,255,255,.55)";
    ctx.lineWidth = p.hasBall ? 3 : 1; ctx.stroke();
    ctx.fillStyle="#fff"; ctx.font="700 9px system-ui"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(String(p.num), x, y);
    if (p.job) {
      ctx.fillStyle="rgba(255,255,255,.75)"; ctx.font="7px system-ui";
      ctx.fillText(p.job, x, y - r - 4);
    }
  }
  const b = f.ball;
  ctx.beginPath(); ctx.arc(px(b.x), py(b.y), 4, 0, Math.PI*2);
  ctx.fillStyle="#fff"; ctx.fill(); ctx.strokeStyle="rgba(0,0,0,.6)"; ctx.lineWidth=1; ctx.stroke();
}

const g = document.getElementById("g");
for (const f of FRAMES) {
  const cell = document.createElement("div"); cell.className = "cell";
  const cap = document.createElement("div"); cap.className = "cap";
  cap.textContent = "t=" + f.t + "s  " + f.score.home + "-" + f.score.away + (f.ball.restartType ? "  [" + f.ball.restartType + "]" : "");
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  drawFrame(c.getContext("2d"), f);
  cell.appendChild(cap); cell.appendChild(c); g.appendChild(cell);
}
})();
</script></body></html>`;

mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 1200 }, deviceScaleFactor: 2 });
page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
page.on("console", (msg) => { if (msg.type() === "error") console.error("CONSOLE:", msg.text()); });
for (const [key, frames] of Object.entries(captured)) {
  if (!frames.length) continue;
  await page.setContent(html(frames, `${key} — ${scenes[key].label}`));
  await page.waitForTimeout(300);
  const cells = await page.locator("canvas").count();
  console.log(`${key}: rendered ${cells} canvases`);
  const path = `artifacts/pitch-${key}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`wrote ${path}`);
}
await browser.close();
