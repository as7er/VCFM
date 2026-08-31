import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.VCFM_BASE_URL || "http://127.0.0.1:8765";
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const [{ CLUB_TEMPLATES, START_DIVISIONS }, { createWorld }, engine] = await Promise.all([
      import("/js/data.js"),
      import("/js/models.js"),
      import("/js/engine.js"),
    ]);
    const start = CLUB_TEMPLATES.find((club) => START_DIVISIONS.includes(club.division));
    const world = createWorld(start.id, "Browser Performance Audit");
    const progress = [];
    window.addEventListener("vcfm-calendar-progress", (event) => {
      progress.push({ ...event.detail });
    });
    const beforePlayed = world.fixtures.filter((fixture) => fixture.played).length;
    const startedAt = performance.now();
    let days = 0;
    while (days < 7) {
      await engine.advanceDayAsync(world);
      days++;
      const played = world.fixtures.filter((fixture) => fixture.played).length - beforePlayed;
      if (played > 0) break;
    }
    return {
      hardwareConcurrency: navigator.hardwareConcurrency,
      days,
      matches: world.fixtures.filter((fixture) => fixture.played).length - beforePlayed,
      elapsedMs: Math.round(performance.now() - startedAt),
      progress,
    };
  });
  assert.ok(result.matches >= 100, "the benchmark must reach a complete AI matchday");
  assert.ok(result.progress.length > 0, "calendar progress must be observable");
  for (let index = 1; index < result.progress.length; index++) {
    const previous = result.progress[index - 1];
    const current = result.progress[index];
    if (current.total === previous.total) {
      assert.ok(current.completed >= previous.completed, "match progress must be monotonic within a batch");
    }
  }
  const final = result.progress[result.progress.length - 1];
  assert.equal(final.completed, final.total, "the match batch must report completion");
  console.log(JSON.stringify({
    hardwareConcurrency: result.hardwareConcurrency,
    days: result.days,
    matches: result.matches,
    elapsedMs: result.elapsedMs,
    progressEvents: result.progress.length,
    firstProgress: result.progress[0],
    finalProgress: final,
  }, null, 2));
} finally {
  await browser?.close();
}
