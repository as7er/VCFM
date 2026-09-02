/**
 * 官员表现层的浏览器验证：主裁圆点 `R`、边裁圆点 `A`，以及**真实代码路径**下的移动上限。
 *
 * 为什么必须走浏览器：`scripts/_referee-motion-probe.mjs` 量的是**照抄一遍**的公式，
 * 证明不了仓库里那份 `_updateOfficials` 真的这么跑。这里在页面内用 rAF 逐帧记录
 * `.mp-official.referee` 的 `style.left/top`，量的是真正渲染出来的位移。
 *
 * ⚠ v240 那份 `_officials-visual-verify.mjs` 从未提交（`git log --all` 查无此文件），
 *   而且它断言的是「主裁距球 12.6%」——旧实现偏移恒为 ±11/±7、距离由构造保证恒 13.04 格，
 *   那条断言怎么测都过，所以四处缺陷一个都没暴露。本脚本只断言**速度与连续性**。
 *
 * 用法：node scripts/_officials-visual-verify.mjs
 * 产出：.tmp-video/officials-*.png（被 .gitignore 的 `/.tmp-` 族通配忽略，不入库）
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const port = 8877;
const baseUrl = `http://127.0.0.1:${port}/`;
const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const OUT = `${root}/.tmp-video`;
// x 一格 0.68m、y 一格 1.05m（left/top 是百分比，与逻辑格同一标度）
const MX = 0.68;
const MY = 1.05;

const server = spawn("python", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  cwd: root, stdio: "ignore", windowsHide: true,
});

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("static server did not come up");
}

let browser;
try {
  mkdirSync(OUT, { recursive: true });
  await waitForServer();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("dialog", async (d) => {
    await d[/紧急信箱|urgent inbox/i.test(d.message()) ? "dismiss" : "accept"]();
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  // 不等 `vcfm-sw-reloaded-*` 哨兵：那个键名在 browser-e2e 里还写着 v235（缓存已到 v241），
  // 无头模式下不一定会被置上。真正的就绪信号是 `vcfmMainApi` 挂到 window 上。
  await page.waitForFunction(() => !!window.vcfmMainApi, null, { timeout: 90_000 });
  await page.fill("#input-manager", "Officials Audit");
  await page.click("#btn-new-game");
  await page.waitForSelector("#screen-main.active", { timeout: 90_000 });

  // 一次 `#btn-advance` 不一定就推到比赛日（browser-e2e 在这之前还跑了一串引导步骤，
  // 那些步骤本身会吃掉天数）。这里循环推进，直到「进行比赛」可点。
  let kicked = false;
  for (let day = 0; day < 25 && !kicked; day++) {
    const dateBefore = await page.locator("#date-label").innerText();
    await page.locator("#btn-advance").click();
    await page.waitForFunction(
      (before) => document.querySelector("#date-label")?.textContent !== before,
      dateBefore, { timeout: 150_000 }
    );
    kicked = await page.evaluate(() => {
      const b = document.querySelector("#btn-play-match");
      return !!b && !b.disabled;
    });
  }
  assert.ok(kicked, "25 次推进内没有出现可点的「进行比赛」");
  await page.locator("#btn-play-match").click();
  await page.waitForSelector("#screen-match.active", { timeout: 90_000 });
  // 比赛屏打开时是赛前状态，官员不更新。点「快速高光」——用户看到瞬移的正是这条路径
  // （`playSimTimeline` 里的 `_updateOfficials(true)`，soft 档）。
  await page.locator("#btn-sim-fast").click();
  await page.waitForSelector(".mp-official.referee", { timeout: 60_000 });

  // —— 1) 三名官员存在、字母正确、真的画出来了 ——
  const marks = await page.$$eval(".mp-official", (els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        cls: el.className,
        text: (el.textContent || "").trim(),
        fontSize: parseFloat(cs.fontSize),
        display: cs.display,
        color: cs.color,
        ariaHidden: el.getAttribute("aria-hidden"),
        w: Math.round(r.width), h: Math.round(r.height),
        // 字母有没有实际占位：撑开的内容宽度 > 0 才说明文字节点被排版了
        inkWidth: el.scrollWidth,
      };
    })
  );
  console.log(JSON.stringify(marks, null, 2));
  assert.equal(marks.length, 3, "场上必须正好三名官员");
  const ref = marks.find((m) => m.cls.includes("referee"));
  const assistants = marks.filter((m) => m.cls.includes("assistant"));
  assert.ok(ref, "必须有主裁");
  assert.equal(ref.text, "R", "主裁圆点里必须是 R");
  assert.equal(assistants.length, 2, "必须有两名边裁");
  for (const a of assistants) assert.equal(a.text, "A", "边裁圆点里必须是 A");
  for (const m of marks) {
    assert.ok(m.fontSize > 6, `字号必须可读，实测 ${m.fontSize}px`);
    assert.equal(m.display, "flex", "必须 flex 居中，否则字母不在圆心");
    assert.ok(m.inkWidth > 0, "字母必须真的被排版（scrollWidth > 0）");
    assert.equal(m.ariaHidden, "true", "官员是装饰标记，必须保持 aria-hidden");
    assert.ok(m.w >= 15 && m.h >= 15, `圆点尺寸异常：${m.w}×${m.h}`);
  }

  // —— 2) 真实代码路径下的逐帧位移 ——
  await page.evaluate(() => {
    window.__refTrack = [];
    const el = document.querySelector(".mp-official.referee");
    const tick = () => {
      if (el) window.__refTrack.push([parseFloat(el.style.left), parseFloat(el.style.top)]);
      if (window.__refTrack.length < 3000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.waitForFunction(() => window.__refTrack.length >= 1200, null, { timeout: 120_000 });
  const track = await page.evaluate(() => window.__refTrack);
  const steps = [];
  for (let i = 1; i < track.length; i++) {
    const [x0, y0] = track[i - 1];
    const [x1, y1] = track[i];
    if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
    steps.push(Math.hypot((x1 - x0) * MX, (y1 - y0) * MY));
  }
  const maxStep = Math.max(...steps);
  const moved = steps.filter((s) => s > 1e-6).length;
  console.log({ 采样帧: track.length, 有位移帧: moved, 单帧最大位移米: Number(maxStep.toFixed(3)) });
  assert.ok(moved > 20, "主裁必须真的在动（否则这条断言测的是静止画面）");
  // 上限 0.5 m/次更新（= 5 m/s，锚在引擎自己的球员速度上，不是真实主裁的 7 m/s）；
  // 一个 rAF 间隔内偶尔挤进两次更新，所以放宽到 1.8m。
  // 旧实现单帧目标跳变最大 45.87m，任何回归都会远远撞穿这条线。
  assert.ok(maxStep < 1.8, `主裁单帧位移 ${maxStep.toFixed(2)}m 过大，瞬移回归了`);

  await page.locator(".mp-field").screenshot({ path: `${OUT}/officials-field.png` });
  assert.deepEqual(pageErrors, [], `页面报错：${pageErrors.join(" | ")}`);
  console.log("\n✅ 官员表现层验证通过：R/A 字母渲染正常，主裁单帧位移在上限内");
} finally {
  await browser?.close();
  server.kill();
}
