/**
 * 日历推进 Worker 客户端。
 *
 * 整个 world 在独立线程中推进，再把同一份结构化克隆结果原位写回。
 * 这样比赛、积分、球员统计、财政和赛事引用仍由 engine.js 的同一流程结算，
 * 主线程只负责界面，不在收到结果前写入半成品状态。
 */

let requestSeq = 0;

function replaceWorldState(target, source) {
  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) delete target[key];
  }
  for (const [key, value] of Object.entries(source)) target[key] = value;
  return target;
}

export function calendarWorkerSupported() {
  return typeof Worker === "function" && typeof URL === "function";
}

export function runCalendarWorker(world, action, payload = {}) {
  if (!calendarWorkerSupported()) {
    return Promise.reject(new Error("calendar worker unavailable"));
  }
  const requestId = `calendar-${Date.now()}-${++requestSeq}`;
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./calendar-worker.js", import.meta.url), {
      type: "module",
      name: "vcfm-calendar",
    });
    const finish = () => worker.terminate();
    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.requestId !== requestId) return;
      finish();
      if (!message.ok) {
        reject(new Error(message.error || "calendar worker failed"));
        return;
      }
      replaceWorldState(world, message.world);
      resolve(message.result || {});
    };
    worker.onerror = (event) => {
      finish();
      reject(event.error || new Error(event.message || "calendar worker crashed"));
    };
    worker.onmessageerror = () => {
      finish();
      reject(new Error("calendar worker returned an unreadable world snapshot"));
    };
    try {
      worker.postMessage({ requestId, action, world, payload });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
