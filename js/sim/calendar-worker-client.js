/**
 * 日历推进 Worker 客户端。
 *
 * 整个 world 在独立线程中推进，再把同一份结构化克隆结果原位写回。
 * 这样比赛、积分、球员统计、财政和赛事引用仍由 engine.js 的同一流程结算，
 * 主线程只负责界面，不在收到结果前写入半成品状态。
 */

let requestSeq = 0;
let calendarWorker = null;
const pendingRequests = new Map();

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

function stopCalendarWorker(error = null) {
  const worker = calendarWorker;
  calendarWorker = null;
  try {
    worker?.terminate();
  } catch (_) {
    /* already stopped */
  }
  if (error) {
    for (const pending of pendingRequests.values()) pending.reject(error);
    pendingRequests.clear();
  }
}

function ensureCalendarWorker() {
  if (calendarWorker) return calendarWorker;
  calendarWorker = new Worker(new URL("./calendar-worker.js", import.meta.url), {
    type: "module",
    name: "vcfm-calendar",
  });
  calendarWorker.onmessage = (event) => {
    const message = event.data || {};
    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    if (message.progress) {
      try {
        window.dispatchEvent(new CustomEvent("vcfm-calendar-progress", {
          detail: message.progress,
        }));
      } catch (_) {
        /* non-window test environment */
      }
      return;
    }
    pendingRequests.delete(message.requestId);
    if (!message.ok) {
      pending.reject(new Error(message.error || "calendar worker failed"));
      return;
    }
    replaceWorldState(pending.world, message.world);
    pending.resolve(message.result || {});
  };
  calendarWorker.onerror = (event) => {
    stopCalendarWorker(event.error || new Error(event.message || "calendar worker crashed"));
  };
  calendarWorker.onmessageerror = () => {
    stopCalendarWorker(new Error("calendar worker returned an unreadable world snapshot"));
  };
  return calendarWorker;
}

export function runCalendarWorker(world, action, payload = {}) {
  if (!calendarWorkerSupported()) {
    return Promise.reject(new Error("calendar worker unavailable"));
  }
  const requestId = `calendar-${Date.now()}-${++requestSeq}`;
  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { world, resolve, reject });
    try {
      ensureCalendarWorker().postMessage({ requestId, action, world, payload });
    } catch (error) {
      pendingRequests.delete(requestId);
      stopCalendarWorker(error);
      reject(error);
    }
  });
}
