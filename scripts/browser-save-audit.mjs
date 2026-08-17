import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.VCFM_BASE_URL || "http://127.0.0.1:8765";
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/__save_audit__`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("vcfm-saves");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("save database deletion was blocked"));
    });
    const [{ CLUB_TEMPLATES, START_DIVISIONS }, { createWorld }, { compressToUTF16 }] = await Promise.all([
      import("/js/data.js"),
      import("/js/models.js"),
      import("/js/compress.js"),
    ]);
    const start = CLUB_TEMPLATES.find((club) => START_DIVISIONS.includes(club.division));
    const world = createWorld(start.id, "Legacy Migration Audit");
    world.day = 11;
    localStorage.setItem("vc_fm_slot_1", `VCFMZ1:${compressToUTF16(JSON.stringify(world))}`);
    localStorage.setItem("vc_fm_active_slot", "1");
  });

  await page.goto(`${baseUrl}/?menu=1`, { waitUntil: "networkidle" });
  const migrated = await page.evaluate(async () => {
    const save = await import("/js/save.js");
    const world = await save.loadGame(1);
    return {
      day: world?.day,
      hasSave: save.hasSave(1),
      oldPresent: localStorage.getItem("vc_fm_slot_1") != null,
      newPresent: localStorage.getItem("vcfm_slot_1") != null,
    };
  });
  assert.equal(migrated.day, 11);
  assert.equal(migrated.hasSave, true);
  assert.equal(migrated.oldPresent, false, "successful durable migration must remove the old large key");
  assert.equal(migrated.newPresent, false, "durable slots must not remain duplicated in localStorage");

  const saved = await page.evaluate(async () => {
    const [{ CLUB_TEMPLATES, START_DIVISIONS }, { createWorld }, save, serialization] = await Promise.all([
      import("/js/data.js"),
      import("/js/models.js"),
      import("/js/save.js"),
      import("/js/save-serialization.js"),
    ]);
    const start = CLUB_TEMPLATES.find((club) => START_DIVISIONS.includes(club.division));
    const world = createWorld(start.id, "Durable Queue Audit");
    const player = world.clubs[0].players[0];
    player.playingTime = {
      role: "squad",
      history: [{ key: "fixture", season: world.season, day: 2, competitionType: "league", started: true, appeared: true, available: true, minutes: 90 }],
    };
    world.clubs[0].squadPlan = { derived: true, payload: "x".repeat(1000) };
    world.day = 20;
    save.saveGame(world, 2);
    world.day = 21;
    save.saveGame(world, 2);
    await save.waitForPendingSaves();
    const json = serialization.stringifyWorldForSave(world);
    const imported = save.importSaveText(json);
    return {
      loadedDay: (await save.loadGame(2))?.day,
      localRaw: localStorage.getItem("vcfm_slot_2"),
      compactHistory: JSON.parse(json).clubs[0].players[0].playingTime.history[0],
      containsSquadPlan: json.includes("squadPlan"),
      importedDay: imported.day,
    };
  });
  assert.equal(saved.loadedDay, 21, "a coalesced save queue must expose its newest snapshot");
  assert.equal(saved.localRaw, null);
  assert.ok(Array.isArray(saved.compactHistory), "playing-time history must use the compact save format");
  assert.equal(saved.containsSquadPlan, false, "derived squad plans must not inflate saves");
  assert.equal(saved.importedDay, 21, "compact exports must pass structural import validation");

  await page.reload({ waitUntil: "networkidle" });
  const reloaded = await page.evaluate(async () => {
    const save = await import("/js/save.js");
    const world = await save.loadGame(2);
    save.clearSave(2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { day: world?.day, hasAfterClear: save.hasSave(2) };
  });
  assert.equal(reloaded.day, 21, "the newest durable snapshot must survive a reload");
  assert.equal(reloaded.hasAfterClear, false);

  console.log(JSON.stringify({ migrated, saved, reloaded }, null, 2));
} finally {
  await browser?.close();
}
