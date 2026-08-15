import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { chromium } from "playwright";

const port = 8876;
const baseUrl = `http://127.0.0.1:${port}/`;
const server = spawn("python", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  cwd: new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
  stdio: "ignore",
  windowsHide: true,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("local browser test server did not start");
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    metrics.scrollWidth <= metrics.clientWidth + 1,
    `${label} overflows horizontally: ${metrics.scrollWidth} > ${metrics.clientWidth}`
  );
}

async function assertCrestLoaded(locator, label) {
  await locator.waitFor({ state: "visible" });
  const image = await locator.evaluate((element) => ({
    complete: element.complete,
    naturalWidth: element.naturalWidth,
    naturalHeight: element.naturalHeight,
    source: element.currentSrc || element.src,
  }));
  assert.equal(image.complete, true, `${label} did not finish loading`);
  assert.ok(image.naturalWidth > 0 && image.naturalHeight > 0, `${label} has no decoded pixels`);
  assert.ok(image.source.startsWith("data:image/svg+xml"), `${label} must use an offline SVG data URI`);
}

async function assertStraightPassRendering(page) {
  const result = await page.evaluate(async () => {
    const { MatchView } = await import("./js/matchview.js?v=216");
    const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
    const makeClub = (id, color) => {
      const players = positions.map((pos, index) => ({
        id: `${id}-${index}`,
        name: `${id} ${index}`,
        pos,
        number: index + 1,
        age: 25,
        ovr: 12,
        potential: 12,
        fitness: 100,
        morale: 70,
        injured: 0,
        suspended: 0,
        attrs: {
          pace: 12,
          strength: 12,
          passing: 12,
          vision: 12,
          shooting: 12,
          finishing: 12,
          dribbling: 12,
          tackling: 12,
          marking: 12,
          stamina: 12,
          positioning: 12,
          reflexes: 12,
          handling: 12,
          kicking: 12,
          heading: 12,
          crossing: 12,
          decisions: 12,
        },
      }));
      return {
        id,
        name: id,
        short: id,
        color,
        players,
        tactics: {
          formation: "4-3-3",
          lineup: players.map((player) => player.id),
          style: "balanced",
          pressing: 3,
          tempo: 3,
          width: 3,
          defensiveLine: 3,
          roles: [],
          duties: [],
        },
      };
    };

    const root = document.createElement("div");
    root.style.cssText = "position:fixed;left:0;top:0;width:420px;height:650px;z-index:99999";
    document.body.appendChild(root);
    const view = new MatchView(root);
    const home = makeClub("trail-home", "#2563eb");
    const away = makeClub("trail-away", "#dc2626");
    view.mount(home, away);
    view.stopLoop();
    view.setSimDrive(true);
    view.refreshLayout();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const playerFrames = view.players.map((player) => ({
      id: player.id,
      team: player.team,
      role: player.pos,
      num: player.num,
      x: player.x,
      y: player.y,
      heading: player.heading || 0,
    }));
    const passerId = home.players[6].id;
    const receiverId = home.players[7].id;
    const withActors = (passer, receiver) => playerFrames.map((player) => {
      if (player.id === passerId) return { ...player, x: passer.x, y: passer.y };
      if (player.id === receiverId) return { ...player, x: receiver.x, y: receiver.y };
      return player;
    });
    const frames = [
      {
        t: 0,
        ball: { x: 20, y: 40, z: 0, owner: passerId, state: "held" },
        players: withActors({ x: 20, y: 40 }, { x: 50, y: 55 }),
      },
      {
        t: 0.1,
        ball: { x: 30, y: 45, z: 0.1, owner: null, state: "pass" },
        players: withActors({ x: 20, y: 40 }, { x: 50, y: 55 }),
      },
      {
        t: 0.2,
        ball: { x: 40, y: 50, z: 0.05, owner: null, state: "pass" },
        players: withActors({ x: 20, y: 40 }, { x: 50, y: 55 }),
      },
      {
        t: 0.3,
        ball: { x: 50, y: 55, z: 0, owner: receiverId, state: "held" },
        players: withActors({ x: 20, y: 40 }, { x: 50, y: 55 }),
      },
    ];

    const samples = [];
    view.applySimSnapshot(frames[0], { soft: false });
    for (let frameIndex = 0; frameIndex < frames.length - 1; frameIndex++) {
      for (const alpha of [0.2, 0.4, 0.6, 0.8]) {
        view.applySimSnapshotLerped(frames[frameIndex], frames[frameIndex + 1], alpha);
        samples.push({
          frameIndex,
          alpha,
          x: view.ball.x,
          y: view.ball.y,
          carrierId: view.carrier?.id || null,
        });
      }
      view.applySimSnapshot(frames[frameIndex + 1], { soft: false });
    }
    view._drawCanvas();

    const crossErrors = samples.map((sample) => Math.abs(
      (sample.x - 20) * 15 - (sample.y - 40) * 30
    ));
    const kickSamples = samples.filter((sample) => sample.frameIndex === 0);
    const receiveSamples = samples.filter((sample) => sample.frameIndex === 2);
    const flightTrail = view._ballTrail.slice();
    const recordedFinalCarrierId = view.carrier?.id || null;
    const context = view.canvas.getContext("2d");
    const pixels = context.getImageData(0, 0, view.canvas.width, view.canvas.height).data;
    let nonBlankPixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) nonBlankPixels++;
    }
    const canvas = {
      width: view.canvas.width,
      height: view.canvas.height,
      nonBlankPixels,
    };
    const replayScene = view.captureSceneSnapshot();
    const presentationBeforeReplay = {
      passNetwork: JSON.stringify([...view.passNetwork.entries()]),
      heat: JSON.stringify(view.heatCells.map(({ home: valueHome, away: valueAway }) => [valueHome, valueAway])),
    };
    let replayBadgeVisible = false;
    let replayGoalSequenceVisible = false;
    let replayNonBlankPixels = 0;
    const replayCaptions = [];
    const replayPlayed = await view.playGoalHighlight(
      {
        type: "goal",
        minute: 12,
        teamId: home.id,
        playerId: receiverId,
        text: "Goal replay browser audit",
      },
      { homeGoals: 1, awayGoals: 0, minute: 12 },
      { home: home.id, away: away.id },
      {
        speed: 1,
        lang: "en",
        rewatch: true,
        scene: replayScene,
        sleepFn: async () => {
          view._drawCanvas();
          replayCaptions.push(view.captionEl?.textContent || "");
          replayBadgeVisible ||= !view.replayBadgeEl?.classList.contains("hidden");
          replayGoalSequenceVisible ||= view.fsm.current() === "GOAL_SEQUENCE";
          const replayPixels = view.canvas
            .getContext("2d")
            .getImageData(0, 0, view.canvas.width, view.canvas.height)
            .data;
          let nonBlank = 0;
          for (let index = 3; index < replayPixels.length; index += 4) {
            if (replayPixels[index] > 0) nonBlank++;
          }
          replayNonBlankPixels = Math.max(replayNonBlankPixels, nonBlank);
          await Promise.resolve();
        },
      }
    );
    const replayReturn = {
      state: view.fsm.current(),
      subState: view.fsm.subState,
      simDrive: view.simDrive,
    };
    const presentationAfterSyntheticReplay = {
      passNetwork: JSON.stringify([...view.passNetwork.entries()]),
      heat: JSON.stringify(view.heatCells.map(({ home: valueHome, away: valueAway }) => [valueHome, valueAway])),
    };
    const goalFrames = [
      { ...frames[0], t: 8 },
      { ...frames[1], t: 8.03 },
      { ...frames[2], t: 8.06 },
      { ...frames[3], t: 8.09 },
      {
        t: 8.12,
        ball: { x: 50, y: 30, z: 0.25, owner: null, state: "shot" },
        players: withActors({ x: 20, y: 40 }, { x: 50, y: 55 }),
      },
      {
        t: 8.15,
        ball: { x: 50, y: 1.5, z: 0.1, owner: null, state: "shot", netHit: true },
        players: withActors({ x: 20, y: 40 }, { x: 50, y: 55 }),
      },
    ];
    const recordedSamples = [];
    const recordedReplayPlayed = await view.playRecordedGoalReplay({
      frames: goalFrames,
      climaxAt: 8.15,
      lang: "en",
      getSpeed: () => 8,
      onSimT: (simT) => recordedSamples.push(simT),
      returnToLiveSim: true,
    });
    const recordedReplayReturn = {
      state: view.fsm.current(),
      subState: view.fsm.subState,
      simDrive: view.simDrive,
    };
    view.fsm.transition("GOAL_SEQUENCE", "STRIKE", { replay: true });
    const goalSequenceReplayPlayed = await view.playRecordedGoalReplay({
      frames: goalFrames,
      climaxAt: 8.15,
      lang: "en",
      getSpeed: () => 8,
      returnToLiveSim: true,
    });
    const goalSequenceReplayReturn = {
      state: view.fsm.current(),
      subState: view.fsm.subState,
      simDrive: view.simDrive,
    };
    view.fsm.transition("FULL_TIME");
    view._legacyFrozen = true;
    view.simDrive = false;
    const fullTimeReplayPlayed = await view.playRecordedGoalReplay({
      frames: goalFrames,
      climaxAt: 8.15,
      lang: "en",
      getSpeed: () => 8,
    });
    const fullTimeReplayReturn = {
      state: view.fsm.current(),
      subState: view.fsm.subState,
      simDrive: view.simDrive,
      frozen: view._legacyFrozen,
    };
    const presentationAfterRecordedReplay = {
      passNetwork: JSON.stringify([...view.passNetwork.entries()]),
      heat: JSON.stringify(view.heatCells.map(({ home: valueHome, away: valueAway }) => [valueHome, valueAway])),
    };
    view.destroy();
    root.remove();
    return {
      maxCrossError: Math.max(...crossErrors),
      kickCarriers: kickSamples.map((sample) => sample.carrierId),
      receiveCarriers: receiveSamples.map((sample) => sample.carrierId),
      finalCarrierId: recordedFinalCarrierId,
      flightTrail,
      canvas,
      receiverId,
      replayPlayed,
      replayBadgeVisible,
      replayGoalSequenceVisible,
      replayNonBlankPixels,
      replayReturn,
      replayCaptions,
      presentationBeforeReplay,
      presentationAfterSyntheticReplay,
      presentationAfterRecordedReplay,
      recordedReplayPlayed,
      recordedSamples,
      recordedReplayReturn,
      goalSequenceReplayPlayed,
      goalSequenceReplayReturn,
      fullTimeReplayPlayed,
      fullTimeReplayReturn,
    };
  });

  assert.ok(result.maxCrossError < 1e-7, `rendered pass bent off line: ${result.maxCrossError}`);
  assert.deepEqual(result.kickCarriers, [null, null, null, null], "the kicked ball reattached to the passer");
  assert.deepEqual(result.receiveCarriers, [null, null, null, null], "the arriving ball attached before its receiving frame");
  assert.equal(result.finalCarrierId, result.receiverId, "the receiver did not own the ball at the recorded frame");
  assert.equal(result.flightTrail.length, 1, "the completed pass trail leaked into the receiving phase");
  assert.ok(result.canvas.width > 0 && result.canvas.height > 0, "match canvas has no stable dimensions");
  assert.ok(result.canvas.nonBlankPixels > 1000, "match canvas rendered no meaningful pixels");
  assert.equal(result.replayPlayed, true, "spatial goal replay did not start");
  assert.equal(result.replayBadgeVisible, true, "spatial goal replay never displayed replay chrome");
  assert.equal(result.replayGoalSequenceVisible, true, "spatial goal replay never entered GOAL_SEQUENCE");
  assert.ok(result.replayNonBlankPixels > 1000, "spatial goal replay canvas was blank");
  assert.equal(
    result.replayCaptions.some((caption) => /(?:\bA:|\bAssist)/i.test(caption)),
    false,
    "an unassisted goal replay fabricated an assist"
  );
  assert.deepEqual(
    result.presentationAfterSyntheticReplay,
    result.presentationBeforeReplay,
    "synthetic replay mutated pass-network or heatmap data"
  );
  assert.deepEqual(
    result.presentationAfterRecordedReplay,
    result.presentationBeforeReplay,
    "recorded replay mutated pass-network or heatmap data"
  );
  assert.equal(result.recordedReplayPlayed, true, "recorded goal frames did not replay");
  assert.ok(result.recordedSamples.length > 0, "recorded goal replay never advanced through its frames");
  assert.deepEqual(
    result.replayReturn,
    { state: "PLAYING", subState: "SIM_DRIVEN", simDrive: true },
    "spatial goal replay did not restore SIM_DRIVEN playback"
  );
  assert.deepEqual(
    result.recordedReplayReturn,
    { state: "PLAYING", subState: "SIM_DRIVEN", simDrive: true },
    "recorded goal replay did not restore SIM_DRIVEN playback"
  );
  assert.equal(result.goalSequenceReplayPlayed, true, "goal-sequence frames did not replay");
  assert.deepEqual(
    result.goalSequenceReplayReturn,
    { state: "PLAYING", subState: "SIM_DRIVEN", simDrive: true },
    "goal-sequence replay did not restore SIM_DRIVEN playback"
  );
  assert.equal(result.fullTimeReplayPlayed, true, "full-time goal frames did not replay");
  assert.deepEqual(
    result.fullTimeReplayReturn,
    { state: "FULL_TIME", subState: null, simDrive: false, frozen: true },
    "recorded goal replay did not restore the full-time state"
  );
}

const navGroupByTab = {
  dashboard: "overview",
  finance: "overview",
  career: "overview",
  media: "overview",
  squad: "team",
  staff: "team",
  training: "team",
  tactics: "team",
  facilities: "team",
  fixtures: "matches",
  table: "matches",
  transfer: "transfer",
  clubs: "world",
};

async function openTab(page, tab) {
  await page.locator(`[data-nav-group="${navGroupByTab[tab]}"]`).click();
  await page.locator(`[data-tab="${tab}"]:visible`).click();
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await assertStraightPassRendering(page);
  await assertCrestLoaded(page.locator("#start-club-preview .club-crest"), "career setup crest");
  await assertNoHorizontalOverflow(page, "desktop start screen");
  await page.fill("#input-manager", "Browser Audit");
  await page.click("#btn-new-game");
  try {
    await page.waitForSelector("#screen-main.active", { timeout: 90_000 });
  } catch (error) {
    const hint = await page.locator("#start-hint").textContent().catch(() => "");
    throw new Error(`new game did not open: ${hint || "no start hint"}; ${pageErrors.join(" | ") || error.message}`);
  }
  await assertCrestLoaded(page.locator("#club-name .club-crest"), "topbar crest");
  await assertNoHorizontalOverflow(page, "desktop dashboard");
  await page.waitForSelector("#dashboard-priorities > *");
  assert.ok((await page.locator("#dashboard-priorities").innerText()).trim().length > 0, "manager workbench must render priorities or an explicit ready state");
  assert.ok(await page.locator("#dashboard-quick-actions [data-dashboard-link]").count() > 0, "manager workbench must expose contextual actions");
  const dashboardAction = page.locator("#dashboard-quick-actions [data-dashboard-link]").first();
  const dashboardTarget = await dashboardAction.getAttribute("data-dashboard-link");
  await dashboardAction.click();
  await page.waitForSelector(`#tab-${dashboardTarget}.active`);
  await openTab(page, "dashboard");
  const dateBeforeWorkerAdvance = await page.locator("#date-label").innerText();
  await page.locator("#btn-advance").click();
  await page.waitForFunction(
    (before) => document.querySelector("#date-label")?.textContent !== before,
    dateBeforeWorkerAdvance,
    { timeout: 90_000 }
  );
  assert.notEqual(await page.locator("#date-label").innerText(), dateBeforeWorkerAdvance);
  assert.equal(await page.locator("#btn-advance").isEnabled(), true);
  assert.match(await page.locator("#dashboard-advance-summary").innerText(), /推进 1 天|Advanced 1 day/);
  assert.ok((await page.locator("#dashboard-advance-summary").innerText()).trim().length > 0, "calendar advance must explain what changed");

  for (const tab of ["finance", "squad", "staff", "training", "tactics", "facilities", "media", "fixtures", "table", "career"]) {
    await openTab(page, tab);
    await page.waitForTimeout(100);
    await assertNoHorizontalOverflow(page, `desktop ${tab}`);
    if (tab === "tactics") {
      // v209 角色/职责面板：每个首发槽都有角色徽章，点击可打开角色面板并切换角色/职责
      await page.waitForSelector("#pitch .tac-slot");
      assert.equal(await page.locator("#pitch .tac-slot").count(), 11);
      const roleBadges = page.locator("#pitch .tac-role-badge");
      assert.ok((await roleBadges.count()) >= 11, "every on-pitch slot must show a role badge");
      await roleBadges.first().click();
      await page.waitForSelector("#tac-role-panel .tac-role-card");
      const cards = page.locator("#tac-role-panel .tac-role-card");
      assert.ok((await cards.count()) >= 2, "role panel must offer multiple candidate roles");
      assert.ok((await page.locator("#tac-role-panel .tac-duty-btn").count()) >= 1, "role panel must show duty options");
      const beforeRole = await page.locator("#tac-role-panel .tac-role-card.active").innerText();
      await cards.nth(1).click();
      await page.waitForFunction(
        (prev) => document.querySelector("#tac-role-panel .tac-role-card.active")?.textContent !== prev,
        beforeRole
      );
      await page.waitForSelector("#tac-role-panel .tac-duty-btn");
      const dutyButtons = page.locator("#tac-role-panel .tac-duty-btn");
      if ((await dutyButtons.count()) > 1) {
        await dutyButtons.nth(1).click();
        await page.waitForTimeout(80);
      }
      assert.equal(await page.locator("#tac-role-panel .tac-role-card.active").count(), 1, "exactly one role must stay active");
      assert.ok((await page.locator("#tac-role-panel .tac-role-habit-facts").innerText()).trim().length > 0,
        "role panel must explain habit fit or conflict");
    }
    if (tab === "finance") {
      await page.waitForSelector("#finance-sponsorship .sponsor-offer");
      assert.equal(await page.locator("#finance-sponsorship .sponsor-offer").count(), 3);
      assert.ok((await page.locator("#finance-debt").innerText()).trim().length > 0);
      assert.ok((await page.locator("#finance-budget-projection").innerText()).trim().length > 0);
    }
    if (tab === "facilities") {
      await page.waitForSelector("#facilities-grid .facility-card");
      assert.equal(await page.locator("#facilities-grid .facility-card").count(), 3);
      assert.equal(await page.locator("#facilities-grid .facility-level").count(), 3);
      for (const effect of await page.locator("#facilities-grid .facility-effect").allInnerTexts()) {
        assert.ok(effect.trim().length > 0, "each facility card must explain its current effect");
      }
      assert.ok((await page.locator("#facilities-hint").innerText()).trim().length > 0);
    }
    if (tab === "media") {
      // 开局有揭幕报道；即使为空也必须渲染出占位文案，不能是空白面板
      assert.ok((await page.locator("#media-count").innerText()).trim().length > 0);
      assert.ok((await page.locator("#media-feed").innerText()).trim().length > 0);
    }
    if (tab === "table") {
      await page.waitForSelector("#league-table tbody tr");
      assert.equal(await page.locator("#league-table tbody tr").count(), 18);
      assert.equal(await page.locator("#league-table tbody tr.me").count(), 1, "user club must be highlighted once");
      assert.ok((await page.locator("#table-title").innerText()).trim().length > 0);
      assert.ok((await page.locator("#table-hint").innerText()).trim().length > 0);
      // 数据榜与积分榜共享筛选状态，切过去必须同样渲染出来
      await page.locator('[data-league-centre-view="stats"]:visible').click();
      await page.waitForSelector("#stats-goals tbody tr");
      assert.ok((await page.locator("#stats-scope-summary").innerText()).trim().length > 0);
      assert.ok(await page.locator("#stats-goals tbody tr").count() > 0);
      assert.ok(await page.locator("#stats-keepers tbody tr").count() > 0);
      await page.locator('[data-league-centre-view="table"]:visible').click();
    }
    if (tab === "squad") {
      await page.waitForSelector("#squad-plan-summary .squad-plan-table");
      assert.equal(await page.locator("#squad-plan-summary .squad-plan-table tbody tr").count(), 4);
      assert.match(await page.locator("#squad-plan-summary").innerText(), /多年阵容规划|Multi-year squad plan/);
      // 更衣室：领袖/小圈子/不合三块必须都渲染出来（空队也要有占位文案）
      await page.waitForSelector("#dressing-room-summary .dressing-room-block");
      assert.equal(await page.locator("#dressing-room-summary .dressing-room-block").count(), 3);
      assert.match(await page.locator("#dressing-room-summary").innerText(), /更衣室|Dressing room/);
      for (const block of await page.locator("#dressing-room-summary .dressing-room-block ul").allInnerTexts()) {
        assert.ok(block.trim().length > 0, "each dressing-room block must render content or a placeholder");
      }
    }
    if (tab === "staff") {
      const coachCard = page.locator("#staff-current .staff-card").first();
      assert.match(await coachCard.innerText(), /4-3-3|4-2-3-1|4-4-2|3-5-2|5-3-2|4-1-4-1|4-5-1|3-4-3/);
      await coachCard.locator("[data-staff-link]").last().click();
      await page.waitForSelector('#modal:not(.hidden) .staff-impact-list');
      assert.match(await page.locator('#modal:not(.hidden) .staff-impact-list').innerText(), /足球理念|Identity:/);
      await page.keyboard.press("Escape");
    }
  }

  await openTab(page, "transfer");
  await page.waitForSelector("#scout-mission-pos:visible");
  assert.equal(await page.locator("#scout-mission-pos option").count(), 5);
  assert.equal(await page.locator("#scout-mission-profile option").count(), 3);
  assert.equal(await page.locator("#scout-mission-budget option").count(), 4);
  await page.selectOption("#scout-mission-pos", "GK");
  await page.selectOption("#scout-mission-profile", "first_team");
  await page.selectOption("#scout-mission-budget", "500000");
  await page.locator('[data-scout-mission="div3"]').click();
  await page.waitForTimeout(250);
  const scoutingStatus = await page.locator("#scout-mission-status").innerText();
  assert.match(scoutingStatus, /GK.*即战力.*500/, pageErrors.join(" | ") || "scouting mission status did not update");
  assert.equal(await page.locator("[data-scout-mission]:disabled").count(), 3);
  await assertNoHorizontalOverflow(page, "desktop scouting mission");

  await openTab(page, "clubs");
  const externalClubRow = page.locator("#clubs-table tbody tr:not(.me)").first();
  await assertCrestLoaded(externalClubRow.locator(".club-link-crest"), "club table crest");
  assert.match(await externalClubRow.locator("td").nth(5).innerText(), /^\d+-\d+$/);
  await externalClubRow.locator("[data-open-club]").click();
  await page.waitForSelector('#modal:not(.hidden) .club-modal-grid');
  await assertCrestLoaded(page.locator('#modal:not(.hidden) .club-modal-crest'), "club profile crest");
  const externalPlayerAbility = page.locator(".club-modal-grid .compact-table tbody tr").first().locator("td").nth(4);
  assert.match(await externalPlayerAbility.innerText(), /^\d+-\d+$/);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await openTab(page, "transfer");
  await assertNoHorizontalOverflow(page, "mobile scouting mission");
  await openTab(page, "finance");
  await assertNoHorizontalOverflow(page, "mobile finance");
  await openTab(page, "squad");
  await assertNoHorizontalOverflow(page, "mobile squad planning");
  await openTab(page, "tactics");
  await page.waitForSelector("#pitch .tac-slot");
  await page.locator("#pitch .tac-role-badge").first().click();
  await page.waitForSelector("#tac-role-panel .tac-role-card");
  await assertNoHorizontalOverflow(page, "mobile tactics role panel");
  await openTab(page, "dashboard");
  await assertNoHorizontalOverflow(page, "mobile dashboard");
  await openTab(page, "clubs");
  await assertCrestLoaded(page.locator("#clubs-table .club-link-crest").first(), "mobile club table crest");
  await assertNoHorizontalOverflow(page, "mobile clubs");
  await page.locator("#btn-global-search").focus();
  await page.keyboard.press("Control+K");
  await page.waitForSelector('#modal:not(.hidden)[role="dialog"][aria-modal="true"]');
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#btn-global-search").evaluate((element) => element === document.activeElement), true);
  assert.deepEqual(pageErrors, []);

  console.log("Browser E2E passed: spatial goal replay, straight-pass rendering, nonblank match canvas, manager identity, squad planning, club crests, finance, scouting knowledge, desktop/mobile overflow, navigation and modal focus");
} finally {
  await browser?.close();
  server.kill();
}
