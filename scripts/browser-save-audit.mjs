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
    const [{ CLUB_TEMPLATES, START_DIVISIONS }, { createWorld }, onboarding, save, serialization] = await Promise.all([
      import("/js/data.js"),
      import("/js/models.js"),
      import("/js/manager-onboarding.js"),
      import("/js/save.js"),
      import("/js/save-serialization.js"),
    ]);
    const start = CLUB_TEMPLATES.find((club) => START_DIVISIONS.includes(club.division));
    const world = createWorld(start.id, "Durable Queue Audit");
    onboarding.ensureManagerOnboarding(world);
    onboarding.completeManagerOnboardingStep(world, "squad");
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
    const slotThree = structuredClone(world);
    slotThree.managerName = "Isolated Slot Audit";
    slotThree.day = 30;
    save.saveGame(slotThree, 3);
    await save.waitForPendingSaves();
    const json = serialization.stringifyWorldForSave(world);
    const imported = save.importSaveText(json);
    const slotTwo = await save.loadGame(2);
    const slotThreeLoaded = await save.loadGame(3);
    const slots = save.listSlots();
    return {
      loadedDay: slotTwo?.day,
      slotThreeDay: slotThreeLoaded?.day,
      slotThreeManager: slotThreeLoaded?.managerName,
      slotDays: slots.map((slot) => ({ slot: slot.slot, day: slot.day ?? null, empty: slot.empty })),
      localRaw: localStorage.getItem("vcfm_slot_2"),
      compactHistory: JSON.parse(json).clubs[0].players[0].playingTime.history[0],
      containsSquadPlan: json.includes("squadPlan"),
      importedDay: imported.day,
      importedOnboarding: imported.managerOnboarding,
      savedOnboarding: slotTwo?.managerOnboarding,
    };
  });
  assert.equal(saved.loadedDay, 21, "a coalesced save queue must expose its newest snapshot");
  assert.equal(saved.slotThreeDay, 30, "a second slot must retain its own snapshot");
  assert.equal(saved.slotThreeManager, "Isolated Slot Audit", "slot data must not bleed across saves");
  assert.equal(saved.slotDays.find((slot) => slot.slot === 2)?.day, 21);
  assert.equal(saved.slotDays.find((slot) => slot.slot === 3)?.day, 30);
  assert.equal(saved.localRaw, null);
  assert.ok(Array.isArray(saved.compactHistory), "playing-time history must use the compact save format");
  assert.equal(saved.containsSquadPlan, false, "derived squad plans must not inflate saves");
  assert.equal(saved.importedDay, 21, "compact exports must pass structural import validation");
  assert.equal(saved.savedOnboarding?.steps?.squad, true, "durable saves must retain onboarding progress");
  assert.equal(saved.importedOnboarding?.steps?.squad, true, "export/import must retain onboarding progress");

  await page.reload({ waitUntil: "networkidle" });
  const reloaded = await page.evaluate(async () => {
    const save = await import("/js/save.js");
    const world = await save.loadGame(2);
    const otherSlot = await save.loadGame(3);
    save.clearSave(2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      day: world?.day,
      onboardingStep: world?.managerOnboarding?.steps?.squad === true,
      otherSlotDay: otherSlot?.day,
      hasAfterClear: save.hasSave(2),
      otherSlotAfterClear: (await save.loadGame(3))?.day,
    };
  });
  assert.equal(reloaded.day, 21, "the newest durable snapshot must survive a reload");
  assert.equal(reloaded.onboardingStep, true, "onboarding progress must survive a reload");
  assert.equal(reloaded.otherSlotDay, 30, "the other slot must survive a reload");
  assert.equal(reloaded.hasAfterClear, false);
  assert.equal(reloaded.otherSlotAfterClear, 30, "clearing one slot must not remove another slot");

  console.log(JSON.stringify({ migrated, saved, reloaded }, null, 2));
} finally {
  await browser?.close();
}
