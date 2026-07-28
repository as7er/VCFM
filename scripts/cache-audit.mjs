import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

console.log(JSON.stringify({ cache: swCache[1], queryReferences: queryVersions.length }, null, 2));
