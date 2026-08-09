import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CLUB_TEMPLATES } from "../js/data.js";
import {
  clubCrestDataUri,
  clubCrestHtml,
  clubCrestSvg,
  crestVisualSignature,
} from "../js/club-crest.js";

const repo = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(repo, file), "utf8");
const index = read("index.html");
const main = read("js/main.js");
// 渲染层按页签拆到 js/ui/ 后，徽章渲染面不再全部落在 main.js
const uiSources = readdirSync(resolve(repo, "js/ui"))
  .filter((file) => file.endsWith(".js"))
  .map((file) => read(`js/ui/${file}`));
const uiLayer = [main, ...uiSources].join("\n");
const css = read("css/style.css");
const serviceWorker = read("sw.js");

assert.equal(CLUB_TEMPLATES.length, 198);

const signatures = CLUB_TEMPLATES.map(crestVisualSignature);
const svgDocuments = CLUB_TEMPLATES.map(clubCrestSvg);
assert.equal(new Set(signatures).size, CLUB_TEMPLATES.length, "all clubs need a unique crest signature");
assert.equal(new Set(svgDocuments).size, CLUB_TEMPLATES.length, "all clubs need unique rendered crest artwork");

for (const club of CLUB_TEMPLATES) {
  const svg = clubCrestSvg(club);
  assert.match(club.crest.monogram, /^[A-Z]{3,4}$/, `${club.id} crest needs a readable 3-4 letter code`);
  assert.equal(club.crest.monogram, club.shortName, `${club.id} crest and club code must match`);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64">/);
  assert.match(svg, /<clipPath/);
  assert.match(svg, /<text[^>]*letter-spacing="0"/);
  assert.ok(svg.includes(club.crest.monogram), `${club.id} crest includes its monogram`);
  assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|src)="https?:\/\//i);
  assert.ok(clubCrestDataUri(club).startsWith("data:image/svg+xml;charset=utf-8,"));
  assert.equal(clubCrestSvg(structuredClone(club)), svg, `${club.id} crest is stable`);
}

const sample = CLUB_TEMPLATES[0];
const decorative = clubCrestHtml(sample, { size: 18 });
const labelled = clubCrestHtml(sample, { size: 96, decorative: false, label: sample.nameEn });
assert.match(decorative, /width="18" height="18" alt="" aria-hidden="true"/);
assert.match(labelled, new RegExp(`width="96" height="96" alt="${sample.nameEn}"`));

assert.ok(index.includes('id="start-club-preview"'), "new-career club preview must exist");
assert.match(uiLayer, /from "\.\.?\/(?:\.\.\/)?club-crest\.js\?v=\d+";/, "the UI layer must import the crest renderer");
for (const surface of [
  "start-club-crest",
  "topbar-club-crest",
  "global-search-club-crest",
  "club-link-crest",
  "club-modal-crest",
  "match-club-crest",
]) {
  assert.ok(uiLayer.includes(`className: "${surface}"`), `${surface} must render a real club crest`);
}
assert.ok(css.includes(".club-crest"), "crest images need stable shared sizing styles");
assert.ok(serviceWorker.includes('"./js/club-crest.js"'), "crest renderer must work offline");

console.log(JSON.stringify({ clubs: CLUB_TEMPLATES.length, uniqueCrests: new Set(signatures).size, format: "inline SVG data URI" }, null, 2));
