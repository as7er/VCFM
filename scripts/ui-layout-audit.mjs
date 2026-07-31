import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(repo, file), "utf8");
const html = read("index.html");
const main = read("js/main.js");
const css = read("css/style.css");
const i18n = read("js/i18n.js");

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
assert.ok(css.includes(".finance-layout"));
assert.ok(css.includes(".btn:focus-visible"));
assert.ok(css.includes("min-height: 100dvh"), "mobile modals should use the viewport");

for (const key of ["nav.overview", "nav.team", "nav.matches", "nav.transfer", "nav.world", "squad.compact", "squad.full"]) {
  assert.equal((i18n.match(new RegExp(`"${key.replace(".", "\\.")}"`, "g")) || []).length, 2, `${key} must exist in both languages`);
}

console.log(`UI layout audit passed: ${ids.length} unique IDs, ${tabs.length} pages, 5 navigation groups`);
