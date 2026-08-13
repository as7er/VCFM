import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const read = (relative) => readFileSync(resolve(repo, relative), "utf8");

const index = read("index.html");
const serviceWorker = read("sw.js");
const main = read("js/main.js");
const agents = read("AGENTS.md");

const swCache = serviceWorker.match(/const CACHE = "(vcfm-v(\d+))";/);
const pageCache = index.match(/var CURRENT_CACHE = "(vcfm-v(\d+))";/);
assert.ok(swCache, "sw.js must declare a versioned VCFM cache");
assert.ok(pageCache, "index.html must declare the protected VCFM cache");
assert.equal(pageCache[1], swCache[1], "index.html and sw.js cache names must match");

const version = swCache[2];
const queryVersions = [...`${index}\n${main}`.matchAll(/\?v=(\d+)/g)].map((match) => match[1]);
assert.ok(queryVersions.length, "entry assets must use versioned query strings");
assert.ok(
  queryVersions.every((item) => item === version),
  `all entry query strings must use v${version}: ${[...new Set(queryVersions)].join(", ")}`
);

assert.ok(
  index.includes(`vcfm-sw-reloaded-v${version}`),
  "service-worker controller refresh key must match the cache version"
);

const documentedCaches = [...agents.matchAll(/vcfm-v\d+/g)].map((match) => match[0]);
assert.ok(documentedCaches.length, "AGENTS.md must document the active cache");
assert.equal(
  documentedCaches[0],
  swCache[1],
  `the active cache at the top of AGENTS.md must be ${swCache[1]}`
);

assert.ok(!serviceWorker.includes("cache.addAll(ASSETS)"), "precache must preserve successful assets");
const assetsBlock = serviceWorker.match(/const ASSETS = \[([\s\S]*?)\];/);
assert.ok(assetsBlock, "sw.js must declare its precache assets");
const assets = [...assetsBlock[1].matchAll(/"\.\/(.*?)"/g)].map((match) => match[1]);
const missingAssets = assets.filter((asset) => asset && !existsSync(resolve(repo, asset)));
assert.deepEqual(missingAssets, [], `precache assets must exist: ${missingAssets.join(", ")}`);

// 反向检查：运行时能抵达的每个模块都必须登记进 ASSETS，
// 否则离线运行时取不到该模块，对应页签白屏或功能静默失效。
const precached = new Set(assets);
const entryPoints = [
  ...[...index.matchAll(/<script[^>]*\bsrc="([^"?]+)/g)].map((match) => match[1]),
  // Worker 由 new Worker(new URL(...)) 启动，不在任何 import 图内
  "js/save-worker.js",
  "js/sim/calendar-worker.js",
  "js/sim/match-worker.js",
].filter((entry) => entry.endsWith(".js") && existsSync(resolve(repo, entry)));
assert.ok(entryPoints.length, "at least one runtime entry point must be resolvable");

const visited = new Set();
const unregistered = new Map();
function walkModule(relative) {
  if (visited.has(relative)) return;
  visited.add(relative);
  const absolute = resolve(repo, relative);
  if (!existsSync(absolute)) return;
  const source = readFileSync(absolute, "utf8");
  const directory = relative.split("/").slice(0, -1).join("/");
  // 静态 import/export ... from "..." 与动态 import("...") 都会产生离线请求
  const specifiers = [
    ...[...source.matchAll(/(?:from|import)\s*\(?\s*"(\.[^"]+)"/g)].map((match) => match[1]),
    ...[...source.matchAll(/new URL\(\s*"(\.[^"]+)"\s*,\s*import\.meta\.url/g)].map((match) => match[1]),
  ];
  for (const specifier of specifiers) {
    const bare = specifier.replace(/\?.*$/, "");
    if (!bare.endsWith(".js")) continue;
    const target = resolve(repo, directory, bare)
      .slice(repo.length + 1)
      .split("\\")
      .join("/");
    if (!existsSync(resolve(repo, target))) continue;
    if (!precached.has(target)) {
      if (!unregistered.has(target)) unregistered.set(target, new Set());
      unregistered.get(target).add(relative);
    }
    walkModule(target);
  }
}
for (const entry of entryPoints) walkModule(entry);

const unregisteredReport = [...unregistered.entries()]
  .map(([target, importers]) => `${target} (imported by ${[...importers].sort().join(", ")})`)
  .sort();
assert.deepEqual(
  unregisteredReport,
  [],
  `every reachable module must be precached in sw.js ASSETS, or offline runs break:\n  ${unregisteredReport.join("\n  ")}`
);

console.log(JSON.stringify({
  cache: swCache[1],
  queryReferences: queryVersions.length,
  assets: assets.length,
  entryPoints: entryPoints.length,
  reachableModules: visited.size,
}, null, 2));
