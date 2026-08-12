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

  console.log("Browser E2E passed: manager identity, squad planning, club crests, finance, scouting knowledge, desktop/mobile overflow, navigation and modal focus");
} finally {
  await browser?.close();
  server.kill();
}
