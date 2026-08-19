import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(repo, file), "utf8");
const html = read("index.html");
const main = read("js/main.js");
const css = read("css/style.css");
const i18n = read("js/i18n.js");
const workbench = read("js/ui/manager-workbench.js");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML ids must be unique after dashboard reflow");

const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((match) => match[1]);
assert.equal(tabs.length, 16, "all existing game pages must remain reachable");
for (const tab of tabs) {
  if (tab !== "table") assert.ok(html.includes(`id="tab-${tab}"`), `missing panel for ${tab}`);
  assert.ok(main.includes(`"${tab}"`), `navigation groups must include ${tab}`);
}

assert.equal((html.match(/data-nav-group=/g) || []).length, 5, "five primary navigation groups required");
assert.ok(html.includes('data-squad-view="compact"'));
assert.ok(html.includes('data-squad-view="full"'));
assert.ok(main.includes("squadTableView"));
assert.doesNotMatch(main, /(?<!\$)\$\(\"\.(?:primary-tab|tab|tab-panel)\"\)\.forEach/, "navigation loops must use the multi-element selector");
assert.ok(css.includes("#squad-table.squad-compact .squad-detail"));
assert.ok(css.includes(".dashboard-layout"));
assert.ok(html.includes('id="dashboard-priorities"'), "manager workbench priority region required");
assert.ok(html.includes('id="dashboard-onboarding"'), "first-week onboarding region required");
assert.ok(html.includes('id="dashboard-quick-actions"'), "manager workbench quick actions required");
assert.ok(html.includes('id="dashboard-advance-summary"'), "calendar change summary required");
assert.ok(main.includes("collectDashboardWorkbench"), "dashboard must derive priorities from live world state");
assert.ok(main.includes("managerOnboardingView"), "dashboard must derive onboarding from save state");
assert.ok(main.includes("captureAdvanceSnapshot") && main.includes("buildAdvanceDigest"), "calendar advancement must compare before/after state");
assert.ok(main.includes('closest("[data-dashboard-link]")'), "workbench links must use delegated tab navigation");
assert.ok(workbench.includes("renderManagerWorkbench"));
assert.ok(css.includes(".dashboard-priority-item") && css.includes(".dashboard-advance-summary"));
assert.ok(css.includes(".finance-layout"));
assert.ok(css.includes(".btn:focus-visible"));
assert.ok(css.includes("min-height: 100dvh"), "mobile modals should use the viewport");
assert.match(css, /html\[data-theme="light"\] \.staff-diff-tag\.elite \{[^}]*color: #9a3412;/s, "elite-club staff tags need high-contrast light-theme text");
assert.match(css, /html\[data-theme="light"\] \.staff-diff-tag\.star \{[^}]*color: #166534;/s, "top-rated staff tags must remain distinct and readable in the light theme");

for (const key of [
  "nav.overview", "nav.team", "nav.matches", "nav.transfer", "nav.world",
  "squad.compact", "squad.full", "dash.workbenchEyebrow", "dash.todayPriorities",
  "dash.quickActions", "dash.advanceChanges", "dash.ready",
]) {
  assert.equal((i18n.match(new RegExp(`"${key.replace(".", "\\.")}"`, "g")) || []).length, 2, `${key} must exist in both languages`);
}

console.log(`UI layout audit passed: ${ids.length} unique IDs, ${tabs.length} pages, 5 navigation groups`);
