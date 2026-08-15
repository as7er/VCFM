import { performance } from "node:perf_hooks";

import { CLUB_TEMPLATES, START_DIVISIONS } from "../js/data.js";
import { createWorld } from "../js/models.js";
import { advanceDay } from "../js/engine.js";
import { compressToUTF16 } from "../js/compress.js";

const args = new Set(process.argv.slice(2));
const daysArg = process.argv.find((arg) => arg.startsWith("--days="));
const days = Math.max(1, Math.min(28, Number(daysArg?.slice(7) || 7)) || 7);
const spatial = args.has("--spatial");
const start = CLUB_TEMPLATES.find((club) => START_DIVISIONS.includes(club.division));
if (!start) throw new Error("a playable starting club is required");

function snapshotMetrics(world) {
  const serializeStart = performance.now();
  const json = JSON.stringify(world);
  const serializeMs = performance.now() - serializeStart;
  const compressStart = performance.now();
  const packed = compressToUTF16(json);
  const compressMs = performance.now() - compressStart;
  return {
    day: world.day,
    season: world.season,
    rawMiB: Number((Buffer.byteLength(json) / 1048576).toFixed(2)),
    packedMiB: Number(((packed.length * 2) / 1048576).toFixed(2)),
    news: world.news?.length || 0,
    media: world.media?.length || 0,
    reports: (world.fixtures || []).filter((fixture) => fixture.matchReport).length,
    financeEntries: (world.clubs || []).reduce(
      (total, club) => total + (club.finance?.financeLedger?.length || 0),
      0
    ),
    serializeMs: Number(serializeMs.toFixed(1)),
    compressMs: Number(compressMs.toFixed(1)),
  };
}

const worldStart = performance.now();
const world = createWorld(start.id, "Performance Benchmark");
const createMs = performance.now() - worldStart;
const initialSnapshot = snapshotMetrics(world);
const samples = [{ label: "start", advanceMs: 0, ...initialSnapshot }];

const options = spatial
  ? { aiEngineMode: "spatial", aiSimulationProfile: "background" }
  : { aiEngineMode: "probability" };
const benchmarkStart = performance.now();
let totalAdvanceMs = 0;
let totalSerializeMs = samples[0].serializeMs;
let totalCompressMs = samples[0].compressMs;
for (let index = 0; index < days; index++) {
  const tickStart = performance.now();
  advanceDay(world, options);
  const tickMs = performance.now() - tickStart;
  totalAdvanceMs += tickMs;
  const snapshot = snapshotMetrics(world);
  totalSerializeMs += snapshot.serializeMs;
  totalCompressMs += snapshot.compressMs;
  samples.push({
    label: `day-${world.day}`,
    advanceMs: Number(tickMs.toFixed(1)),
    ...snapshot,
  });
}
const loopWallMs = performance.now() - benchmarkStart;
const totalWallMs = performance.now() - worldStart;

console.log(JSON.stringify({
  node: process.version,
  mode: spatial ? "background-spatial" : "probability",
  requestedDays: days,
  createMs: Number(createMs.toFixed(1)),
  totalAdvanceMs: Number(totalAdvanceMs.toFixed(1)),
  totalSerializeMs: Number(totalSerializeMs.toFixed(1)),
  totalCompressMs: Number(totalCompressMs.toFixed(1)),
  totalSnapshotMs: Number((totalSerializeMs + totalCompressMs).toFixed(1)),
  initialSnapshotMs: Number((initialSnapshot.serializeMs + initialSnapshot.compressMs).toFixed(1)),
  loopWallMs: Number(loopWallMs.toFixed(1)),
  totalWallMs: Number(totalWallMs.toFixed(1)),
  samples,
}, null, 2));
