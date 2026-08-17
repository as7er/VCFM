import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CAMERA_PRESET_IDS,
  cameraFraming,
  crowdAtmosphere,
  normalizeCameraPreset,
  visualCuePolicy,
} from "../js/match-broadcast.js";

const repo = resolve(import.meta.dirname, "..");
const source = (path) => readFileSync(resolve(repo, path), "utf8");

assert.deepEqual(CAMERA_PRESET_IDS, ["full", "tv", "tactical"]);
assert.equal(normalizeCameraPreset("unknown"), "tv");

for (const preset of ["full", "tactical"]) {
  assert.deepEqual(
    cameraFraming({ preset, ball: { x: 94, y: 5 }, mode: "box", goalSequence: true, boosted: true }),
    { x: 0, y: 0, scale: 1 },
    `${preset} camera must remain fixed even during a goal sequence`
  );
}
const tvWide = cameraFraming({ preset: "tv", ball: { x: 50, y: 50 }, mode: "follow" });
const tvBox = cameraFraming({ preset: "tv", ball: { x: 82, y: 8 }, mode: "box", boosted: true });
assert.ok(tvWide.scale > 1 && tvWide.scale < 1.04, "TV camera should keep restrained midfield framing");
assert.ok(tvBox.scale > tvWide.scale, "TV camera should push in for box action");
assert.ok(Math.abs(tvBox.x) <= 2.4 && Math.abs(tvBox.y) <= 2.8, "TV pan must remain bounded");

assert.equal(visualCuePolicy({ preset: "tactical" }).drawStructure, true);
assert.equal(visualCuePolicy({ preset: "full" }).drawStructure, false);
assert.equal(
  visualCuePolicy({ preset: "full", speed: 1.4, hasBall: false }).drawTrail,
  false,
  "full-pitch view should not paint routine sprint trails"
);
assert.equal(
  visualCuePolicy({ preset: "tv", speed: 1.2, focused: true }).drawTrail,
  true,
  "TV view may retain one decisive movement cue"
);
assert.equal(visualCuePolicy({ preset: "tv", hasBall: true }).drawPossessionRing, true);
assert.equal(visualCuePolicy({ preset: "tv", speed: 0.8, pressing: true }).drawArrow, true);

const quiet = crowdAtmosphere({ context: { attendanceRatio: 0.4 }, ball: { x: 50, y: 50 } });
const fullHouse = crowdAtmosphere({ context: { attendanceRatio: 1 }, ball: { x: 50, y: 50 } });
const derbyDanger = crowdAtmosphere({
  context: { attendanceRatio: 1, derby: true, bigMatch: true, importance: 1 },
  ball: { x: 76, y: 8 },
  ownerTeam: "home",
  minute: 86,
  homeGoals: 1,
  awayGoals: 1,
});
assert.ok(fullHouse.intensity > quiet.intensity, "the crowd bed must read attendance");
assert.ok(derbyDanger.intensity > fullHouse.intensity, "occasion, danger and late tension must raise the crowd");
assert.ok(derbyDanger.pan > 0, "crowd stereo position must read the live ball side");

const viewSource = source("js/matchview.js");
const mainSource = source("js/main.js");
const indexSource = source("index.html");
assert.ok(viewSource.includes("_drawTacticalStructure(ctx, px, py)"), "tactical lines must use live player positions");
assert.ok(viewSource.includes("if (!this.carrier && trail.length >= 2)"), "held-ball trails must stay hidden");
assert.ok(!viewSource.includes("for (let k = 1; k <= 3; k++)"), "three-layer sprint ghosts must not return");
assert.ok(!viewSource.includes("r + 7.5"), "the old outer possession glow must not return");
assert.ok(viewSource.includes("source.loop = true"), "match audio needs a continuous generated crowd bed");
assert.ok(viewSource.includes("crowdAtmosphere({"), "live spatial facts must drive the crowd bed");
assert.ok(mainSource.includes("vcfm-match-camera"), "camera choice must persist between matches");
for (const preset of CAMERA_PRESET_IDS) {
  assert.ok(indexSource.includes(`data-match-camera="${preset}"`), `missing ${preset} camera control`);
}

console.log("Match broadcast audit passed: fixed full/tactical cameras, restrained TV framing, live tactical lines and context-driven crowd audio");
