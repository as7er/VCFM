/**
 * 表现层 A1/A2 浏览器目验：真实渲染路径下的画幅与镜头。
 *
 * 为什么必须走浏览器：几何探针（_camera-framing-geometry-probe.mjs）验证的是
 * cameraFraming 的返回值；这里验证的是 `_applyCamera` 把它写进 style.transform、
 * 经真实 CSS（origin 中心 + 相机内缩 5.5% + overflow 裁剪）渲染后的结果：
 *   A1 画幅：列宽 640px 生效、球场高度跟上（旧 56vh/560px 不再压扁）；
 *   A2 镜头：scale 进入 1.28~1.5 广播带（旧 1.015~1.055 ≈ 全球场）、
 *            球心在逐帧采样下几乎恒在画面内（允许跟镜缓动的瞬态越界）。
 *
 * 用法：node scripts/_presentation-a1a2a3-visual-verify.mjs
 * 产出：.tmp-video/present-*.png（.gitignore 的 /.tmp- 族忽略，不入库）
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const port = 8879;
const baseUrl = `http://127.0.0.1:${port}/`;
const root = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const OUT = `${root}/.tmp-video`;

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
  page.on("dialog", async (d) => { await d.accept(); });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.vcfmMainApi, null, { timeout: 90_000 });
  await page.fill("#input-manager", "Presentation Audit");
  await page.click("#btn-new-game");
  await page.waitForSelector("#screen-main.active", { timeout: 90_000 });

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

  // ---- A1 画幅（桌面 1440×1000：列放宽到 640 的收益屏） ----
  const a1 = await page.evaluate(() => {
    const col = document.querySelector(".match-layout.fm-match.fmm-match");
    const field = document.querySelector(".mp-field");
    const colR = col.getBoundingClientRect();
    const fieldR = field.getBoundingClientRect();
    return {
      colW: Math.round(colR.width),
      fieldW: Math.round(fieldR.width),
      fieldH: Math.round(fieldR.height),
      bodyScrollX: document.scrollingElement.scrollWidth - window.innerWidth,
    };
  });
  console.log("A1 画幅:", JSON.stringify(a1));
  assert.ok(a1.colW > 480 && a1.colW <= 640, `列宽应为 (480, 640]，实测 ${a1.colW}`);
  // 旧 56vh/560px：1000px 视口下球场高只有 560；新 76vh/760px 应 ≥ 700
  assert.ok(a1.fieldH >= 700, `球场高度应 ≥ 700（旧 56vh 只有 ~560），实测 ${a1.fieldH}`);
  assert.ok(a1.fieldW >= a1.colW - 2, "球场应占满列宽");
  assert.ok(a1.bodyScrollX <= 0, `页面不得出现横向滚动，超出 ${a1.bodyScrollX}px`);

  // ---- A2 镜头：快速高光路径逐帧采样 ----
  await page.locator("#btn-sim-fast").click();
  await page.waitForSelector("#mp-camera", { timeout: 60_000 });

  // 页内采样器：rAF 逐帧记录相机 transform 与球坐标（球 DOM 隐身但坐标仍在更新）。
  // 屏幕可见性用已验证的几何模型换算（与探针同一推导，见该探针文件头）：
  //   hx = 0.89·s·bx + 50 − 44.5·s + 0.89·tx；hy = s·by + 50 − 50·s + ty
  await page.evaluate(() => {
    window.__camTrack = [];
    const cam = document.querySelector("#mp-camera");
    const ball = document.querySelector(".mp-actors .mp-ball");
    const field = document.querySelector(".mp-field");
    window.__camField = field.getBoundingClientRect();
    const tick = () => {
      if (!document.querySelector("#screen-match.active") || window.__camTrack.length >= 3600) return;
      const m = /translate\(([-\d.]+)%,\s*([-\d.]+)%\)\s*scale\(([\d.]+)\)/.exec(cam.style.transform || "");
      const fr = window.__camField;
      let sample = null;
      if (m && ball) {
        const tx = parseFloat(m[1]), ty = parseFloat(m[2]), s = parseFloat(m[3]);
        const bx = parseFloat(ball.style.left), by = parseFloat(ball.style.top);
        const hx = 0.89 * s * bx + 50 - 44.5 * s + 0.89 * tx;
        const hy = s * by + 50 - 50 * s + ty;
        const px = fr.left + (hx / 100) * fr.width;
        const py = fr.top + (hy / 100) * fr.height;
        sample = {
          s, tx, ty, bx, by,
          out: hx < -0.5 || hx > 100.5 || hy < -0.5 || hy > 100.5, // 球心出画（0.5% 容差）
          px: Math.round(px), py: Math.round(py),
        };
      }
      window.__camTrack.push(sample);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // 等采样量或比赛结束（快速高光整场跑完）
  await page.waitForFunction(
    () => window.__camTrack.length >= 3600 || !document.querySelector("#screen-match.active"),
    null, { timeout: 600_000 }
  );
  await page.waitForFunction(() => window.__camTrack.length >= 2400 || !document.querySelector("#screen-match.active"), null, { timeout: 30_000 }).catch(() => {});
  const track = (await page.evaluate(() => window.__camTrack)).filter(Boolean);
  const matchEnded = await page.evaluate(() => !document.querySelector("#screen-match.active"));
  console.log(`采样帧 ${track.length}${matchEnded ? "（比赛已完整跑完）" : ""}`);

  assert.ok(track.length >= 1200, `有效采样不足：${track.length} 帧`);
  const scales = track.map((t) => t.s);
  const maxS = Math.max(...scales);
  const minS = Math.min(...scales);
  const outFrames = track.filter((t) => t.out);
  const outFrac = outFrames.length / track.length;
  console.log({
    scaleMin: Number(minS.toFixed(3)),
    scaleMax: Number(maxS.toFixed(3)),
    球心出画帧: outFrames.length,
    出画占比: `${(outFrac * 100).toFixed(2)}%`,
  });
  // 旧设计 scale 峰值 1.075；新设计 wide 就 1.28、box 到 1.45+。
  // 开赛前摆位（全球场看阵型）与启动缓动（cam 从 1 缓到 1.28）是合法低帧，
  // 用分位数断言「广播跟镜已是常态」，min 只做 sanity。
  const sorted = [...scales].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  console.log({ scaleP90: Number(p90.toFixed(3)) });
  assert.ok(minS >= 0.99, `scale 异常：${minS.toFixed(3)}`);
  assert.ok(p90 >= 1.27, `90 分位 scale 只有 ${p90.toFixed(3)}——广播跟镜未成常态（死球泵回全球场？）`);
  // box 档（1.45/1.5）是短暂事件且 kZoom 缓动时间常数 ~0.5s，applied scale 爬不满就回落
  // （实测峰值 ≈1.347 = 爬升中被采样）。断言「推近有迹象」而不是「到达 1.45」。
  assert.ok(maxS >= 1.32, `scale 峰值只有 ${maxS.toFixed(3)}——box 推近毫无迹象？`);
  // 跟镜缓动（kPan≈0.05/帧 的指数滞后）允许极少数瞬态越界；持续出画说明钳制又错了
  assert.ok(outFrac < 0.02, `球心出画占比 ${(outFrac * 100).toFixed(2)}% 过高——镜头窗口几何有问题`);

  // ---- 深区/角球时刻截图（人眼复核不露场外、不压扁） ----
  await page.evaluate(() => {
    window.__deepShot = null;
    const cam = document.querySelector("#mp-camera");
    const ball = document.querySelector(".mp-actors .mp-ball");
    const tick = () => {
      if (window.__deepShot) return;
      const m = /translate\(([-\d.]+)%,\s*([-\d.]+)%\)\s*scale\(([\d.]+)\)/.exec(cam.style.transform || "");
      if (m) {
        const by = parseFloat(ball.style.top);
        if ((by < 15 || by > 85) && parseFloat(m[3]) >= 1.29) window.__deepShot = true;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.waitForFunction(() => window.__deepShot === true || !document.querySelector("#screen-match.active"), null, { timeout: 300_000 });
  if (await page.locator(".mp-field").count()) {
    await page.locator(".mp-field").screenshot({ path: `${OUT}/present-deep.png` });
    await page.locator(".match-layout.fm-match.fmm-match").screenshot({ path: `${OUT}/present-column.png` });
  } else {
    console.log("（比赛画面已关闭，跳过深区截图——采样统计已足够）");
  }

  assert.deepEqual(pageErrors, [], `页面报错：${pageErrors.join(" | ")}`);
  console.log("\n✅ A1/A2 目验通过：640px 列 + 高球场生效，scale 在广播带内，球心逐帧几乎恒在画内");
} finally {
  await browser?.close();
  server.kill();
}
