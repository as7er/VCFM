import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const main = readFileSync(resolve(repo, "js/main.js"), "utf8");
const serviceWorker = readFileSync(resolve(repo, "sw.js"), "utf8");

assert.ok(
  !/from\s+["']\.\/matchview\.js/.test(main),
  "match view must not be part of the initial static module graph"
);
assert.ok(
  /import\(["']\.\/matchview\.js\?v=\d+["']\)/.test(main),
  "match view must be loaded through a versioned dynamic import"
);
assert.ok(/async function ensureMatchPitch/.test(main));
assert.ok(serviceWorker.includes('"./js/matchview.js"'), "offline cache must include the lazy module");

console.log(JSON.stringify({ lazyModule: "js/matchview.js", offline: true }, null, 2));
