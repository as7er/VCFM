import {
  commitPreparedMatch,
  prepareMatchSimulation,
  runPreparedMatchSimulation,
} from "../match.js";

const MAX_WORKERS = 12;
const FALLBACK_WORKERS = 4;

function workerCount(taskCount) {
  const cores = Math.max(2, Number(globalThis.navigator?.hardwareConcurrency) || FALLBACK_WORKERS);
  return Math.max(1, Math.min(taskCount, MAX_WORKERS, cores));
}

function fixtureWaves(fixtures) {
  const waves = [];
  let current = [];
  let clubs = new Set();
  for (const fixture of fixtures) {
    if (clubs.has(fixture.home) || clubs.has(fixture.away)) {
      waves.push(current);
      current = [];
      clubs = new Set();
    }
    current.push(fixture);
    clubs.add(fixture.home);
    clubs.add(fixture.away);
  }
  if (current.length) waves.push(current);
  return waves;
}

function runPreparedLocally(prepared) {
  return Promise.resolve().then(() => runPreparedMatchSimulation(prepared));
}

function runWorkerWave(preparedMatches) {
  if (typeof Worker !== "function" || preparedMatches.length < 2) {
    return Promise.all(preparedMatches.map(runPreparedLocally));
  }

  const count = workerCount(preparedMatches.length);
  const workers = [];
  const results = new Array(preparedMatches.length);
  let next = 0;
  let completed = 0;

  return new Promise((resolve, reject) => {
    const stop = () => {
      for (const worker of workers) worker.terminate();
    };
    const fail = (error) => {
      stop();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const dispatch = (worker) => {
      if (next >= preparedMatches.length) return;
      const index = next++;
      worker.postMessage({ taskId: `match-${index}`, prepared: preparedMatches[index] });
    };

    for (let index = 0; index < count; index++) {
      const worker = new Worker(new URL("./match-worker.js", import.meta.url), {
        type: "module",
        name: `vcfm-match-${index + 1}`,
      });
      workers.push(worker);
      worker.onerror = (event) => fail(event.error || new Error(event.message || "match worker crashed"));
      worker.onmessageerror = () => fail(new Error("match worker returned unreadable data"));
      worker.onmessage = (event) => {
        const message = event.data || {};
        const resultIndex = Number(String(message.taskId || "").replace("match-", ""));
        if (!message.ok || !Number.isInteger(resultIndex)) {
          fail(new Error(message.error || "match worker failed"));
          return;
        }
        results[resultIndex] = message.prepared;
        completed++;
        if (completed === preparedMatches.length) {
          stop();
          resolve(results);
          return;
        }
        dispatch(worker);
      };
      dispatch(worker);
    }
  });
}

/**
 * Run independent spatial clocks in parallel, then commit every result on the
 * calendar thread in the original fixture order.
 */
export async function runFixtureBatch(world, fixtures, options) {
  const reports = [];
  for (const wave of fixtureWaves(fixtures)) {
    const prepared = wave.map((fixture) => prepareMatchSimulation(world, fixture, options));
    let completed;
    try {
      completed = await runWorkerWave(prepared);
    } catch (error) {
      console.warn("parallel match workers unavailable; finishing wave locally", error);
      completed = prepared.map((match) => runPreparedMatchSimulation(match));
    }
    for (let index = 0; index < wave.length; index++) {
      reports.push(commitPreparedMatch(world, wave[index], completed[index]));
    }
  }
  return reports;
}
