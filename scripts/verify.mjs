import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const checks = [
  "js/matchview-fsm.test.js",
  "js/matchview-coords.test.js",
  "js/matchview-director.test.js",
  "scripts/cache-audit.mjs",
  "scripts/reality-audit.mjs",
  "scripts/finance-audit.mjs",
  "scripts/finance-ledger-audit.mjs",
  "scripts/finance-budget-audit.mjs",
  "scripts/finance-commitments-audit.mjs",
  "scripts/cash-reservations-audit.mjs",
  "scripts/competition-audit.mjs",
  "scripts/transfer-negotiations-audit.mjs",
  "scripts/sale-negotiations-audit.mjs",
  "scripts/deal-negotiations-audit.mjs",
  "scripts/squad-registration-audit.mjs",
  "scripts/match-seed-audit.mjs",
  "scripts/match-analysis-audit.mjs",
  "scripts/long-term-reality-audit.mjs",
  "scripts/ui-layout-audit.mjs",
  "scripts/ecosystem-audit.mjs",
];

function javascriptFiles(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const absolute = resolve(directory, name);
    const stat = statSync(absolute);
    if (stat.isDirectory()) files.push(...javascriptFiles(absolute));
    else if (/\.(?:js|mjs)$/.test(name)) files.push(absolute);
  }
  return files;
}

function run(args, label) {
  console.log(`\n> ${label}`);
  const result = spawnSync(process.execPath, args, { cwd: repo, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const file of javascriptFiles(resolve(repo, "js"))) {
  run(["--check", file], `syntax ${file.slice(repo.length + 1)}`);
}
for (const check of checks) run([check], check);

console.log("\nVCFM verification passed");
