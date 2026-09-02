/**
 * Pure helpers for keeping live match presentation causal and monotonic.
 *
 * 本模块进入首屏静态图，因此不导入空间引擎（engine.js 走懒加载）。
 * 定位球阶段时长在此定义，引擎反向读取，保证画面与模拟共用同一组时序。
 */

/** 点球判罚 → 开始助跑（模拟秒） */
export const PENALTY_RUN_SEC = 1.35;
/** 点球判罚 → 出脚（模拟秒） */
export const PENALTY_KICK_SEC = 2.05;
/** 点球判罚 → 进球/扑救结算（模拟秒） */
export const PENALTY_RESOLVE_SEC = 2.5;

export function nextDisplayedMinute(current, incoming, { reset = false } = {}) {
  const currentMinute = Number.isFinite(Number(current)) ? Math.max(0, Number(current)) : 0;
  const incomingMinute = Number.isFinite(Number(incoming)) ? Math.max(0, Number(incoming)) : currentMinute;
  return reset ? incomingMinute : Math.max(currentMinute, incomingMinute);
}

/**
 * 模拟秒 → 比赛分钟，全项目唯一换算。
 *
 * 足球计时里 0–59 秒属于 1′、60–119 秒属于 2′，所以是 floor(t/60)+1。
 * 此前进球用 floor+1、事件文案用 round、播放帧顶栏用 ceil，
 * 同一时刻会得出三个不同分钟：39 分 00 秒时文案说 39′、进球说 40′、顶栏说 39′，
 * 于是出现"顶栏已到 40′才播 39′点球"这类因果错乱。
 * @param {number} tSec 模拟秒
 * @returns {number} 1–90
 */
export function simMinuteOf(tSec) {
  const t = Number(tSec);
  if (!Number.isFinite(t) || t <= 0) return 1;
  return Math.max(1, Math.min(90, Math.floor(t / 60) + 1));
}

const FREE_BALL_STATES = new Set(["pass", "shot", "loose", "dead"]);

/**
 * Interpolate the recorded ball without assigning it to a player before the
 * physical transition has reached that frame. Discrete owner/state switching
 * at the middle of a frame used to pull the rendered ball back to a player's
 * feet, creating false bends in otherwise straight passes.
 */
export function interpolateSimBall(from = {}, to = {}, alpha = 0) {
  const t = Math.max(0, Math.min(1, Number(alpha) || 0));
  const fromX = Number.isFinite(Number(from.x)) ? Number(from.x) : 50;
  const fromY = Number.isFinite(Number(from.y)) ? Number(from.y) : 50;
  const fromZ = Number.isFinite(Number(from.z)) ? Number(from.z) : 0;
  const toX = Number.isFinite(Number(to.x)) ? Number(to.x) : fromX;
  const toY = Number.isFinite(Number(to.y)) ? Number(to.y) : fromY;
  const toZ = Number.isFinite(Number(to.z)) ? Number(to.z) : fromZ;
  const fromOwner = from.owner ?? null;
  const toOwner = to.owner ?? null;
  const fromState = from.state || null;
  const toState = to.state || null;

  let owner = t < 0.45 ? fromOwner : toOwner;
  let state = t < 0.45 ? fromState : toState;
  if (t > 0 && t < 1) {
    const kicked = !!fromOwner && !toOwner && FREE_BALL_STATES.has(toState);
    const received = !fromOwner && !!toOwner && FREE_BALL_STATES.has(fromState);
    if (kicked) {
      owner = null;
      state = toState;
    } else if (received) {
      owner = null;
      state = fromState;
    }
  }

  return {
    x: fromX + (toX - fromX) * t,
    y: fromY + (toY - fromY) * t,
    z: fromZ + (toZ - fromZ) * t,
    state,
    owner,
    netHit: t >= 0.5 ? !!to.netHit : !!from.netHit,
    // `deflect` 必须一起带过来。引擎在门将指尖擦球等处设了接触标记，注释写着
    // 「画面上就成了『球在无人接触的情况下自己拐弯』」，adapt 传了、matchview 也画了，
    // 但直播回放**永远**走这个插值器，而这里以前只返回 netHit——那个修复静默失效了。
    // 偏向 `to`：接触发生在后一帧，早显示等于又提前一帧。
    deflect: (t >= 0.85 ? to.deflect : from.deflect) || null,
  };
}

/**
 * 点球从判罚到出脚的模拟秒数。判罚提示的显示时长和镜头停顿都读这个值，
 * 界面才不会在球还没踢出时就把"判罚点球"换成射门或扑救文案。
 */
export const PENALTY_SETUP_SEC = PENALTY_KICK_SEC;

/**
 * 事件文案应当持续到下一个因果事件为止。
 * 引擎里已经确定了定位球各阶段的法定间隔，表现层据此推导显示时长，
 * 避免两条文案争抢同一个 ticker 而出现"判罚未完、扑救已现"。
 * @param {string} type 事件类型
 * @param {number} speed 播放倍速
 * @returns {number} 毫秒
 */
export function eventTickerMs(type, speed = 1) {
  const spd = Math.max(0.25, Math.min(1.5, Number(speed) || 1));
  const base = {
    penalty: PENALTY_KICK_SEC * 1000,
    save: 1600,
    woodwork: 1600,
    chance: 1400,
    corner: 2000,
    offside: 2200,
  };
  return Math.round((base[type] ?? 1800) / spd);
}
