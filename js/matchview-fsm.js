/**
 * MatchView 状态机
 *
 * 用显式状态机替代散落的 phase/scriptLock/frozen/holdUntil 等布尔标志，
 * 明确状态转换条件，避免状态冲突。
 *
 * 状态层级：
 * - IDLE: 未初始化
 * - PRE_MATCH: 赛前静止画面
 * - PLAYING: 正常比赛
 *   - PLAYING.FREE_PLAY: 自由比赛（AI驱动）
 *   - PLAYING.SCRIPTED: 导演脚本控制（高光预演）
 *   - PLAYING.SIM_DRIVEN: 空间模拟驱动（直播回放）
 * - GOAL_SEQUENCE: 进球叙事
 *   - GOAL_SEQUENCE.BUILDUP: 进球前戏
 *   - GOAL_SEQUENCE.STRIKE: 射门瞬间
 *   - GOAL_SEQUENCE.CELEBRATE: 庆祝
 * - PAUSED: 用户暂停
 * - HALF_TIME: 中场休息
 * - FULL_TIME: 比赛结束
 */

export class MatchViewFSM {
  constructor() {
    this.state = 'IDLE';
    this.subState = null;
    this.stateData = {}; // 当前状态附加数据
    this.listeners = new Map(); // state -> callback[]
  }

  /**
   * 状态转换
   * @param {string} newState
   * @param {string} [newSubState]
   * @param {object} [data]
   * @returns {boolean} 转换是否成功
   */
  transition(newState, newSubState = null, data = {}) {
    const oldState = this.state;
    const oldSubState = this.subState;

    // 幂等操作：允许转换到同一状态（例如重新 build 时）
    if (oldState === newState && oldSubState === newSubState) {
      return true;
    }

    // 验证转换合法性
    if (!this._isValidTransition(oldState, oldSubState, newState, newSubState)) {
      console.warn(`[FSM] Invalid transition: ${oldState}${oldSubState ? `.${oldSubState}` : ''} -> ${newState}${newSubState ? `.${newSubState}` : ''}`);
      return false;
    }

    // 执行转换
    this.state = newState;
    this.subState = newSubState;
    this.stateData = data || {};

    // 触发监听器
    this._notifyListeners(oldState, oldSubState, newState, newSubState);

    return true;
  }

  /**
   * 验证状态转换是否合法
   */
  _isValidTransition(fromState, fromSub, toState, toSub) {
    // IDLE 只能进入 PRE_MATCH
    if (fromState === 'IDLE') {
      return toState === 'PRE_MATCH';
    }

    // PRE_MATCH 可以进入 PLAYING 或 PAUSED
    if (fromState === 'PRE_MATCH') {
      return toState === 'PLAYING' || toState === 'PAUSED';
    }

    // PLAYING 的转换规则
    if (fromState === 'PLAYING') {
      // 可以进入任何子状态
      if (toState === 'PLAYING') return true;
      // 可以进入 GOAL_SEQUENCE, PAUSED, HALF_TIME, FULL_TIME
      return ['GOAL_SEQUENCE', 'PAUSED', 'HALF_TIME', 'FULL_TIME'].includes(toState);
    }

    // GOAL_SEQUENCE 的转换
    if (fromState === 'GOAL_SEQUENCE') {
      // 子状态按顺序流转
      if (toState === 'GOAL_SEQUENCE') {
        const order = ['BUILDUP', 'STRIKE', 'CELEBRATE'];
        const fromIdx = fromSub ? order.indexOf(fromSub) : -1;
        const toIdx = toSub ? order.indexOf(toSub) : -1;
        return toIdx >= fromIdx;
      }
      // 庆祝完回到 PLAYING
      return toState === 'PLAYING' && fromSub === 'CELEBRATE';
    }

    // PAUSED 可以恢复到之前的状态（需要额外逻辑记录）
    if (fromState === 'PAUSED') {
      return ['PLAYING', 'PRE_MATCH', 'HALF_TIME'].includes(toState);
    }

    // HALF_TIME 可以进入 PLAYING 或 PAUSED
    if (fromState === 'HALF_TIME') {
      return toState === 'PLAYING' || toState === 'PAUSED';
    }

    // FULL_TIME 是终态
    if (fromState === 'FULL_TIME') {
      return false;
    }

    return false;
  }

  /**
   * 当前状态查询（含子状态）
   */
  is(state, subState = null) {
    if (subState) {
      return this.state === state && this.subState === subState;
    }
    return this.state === state;
  }

  /**
   * 是否在某个状态家族中
   */
  isIn(stateFamily) {
    return this.state === stateFamily;
  }

  /**
   * 当前是否允许 AI 自由行动
   */
  canAIAct() {
    return this.state === 'PLAYING' && this.subState === 'FREE_PLAY';
  }

  /**
   * 当前是否允许用户交互（点击球员等）
   */
  canInteract() {
    return !['IDLE', 'FULL_TIME'].includes(this.state);
  }

  /**
   * 当前是否应该显示暂停UI
   */
  shouldShowPauseUI() {
    return this.state === 'PAUSED' || this.state === 'PRE_MATCH';
  }

  /**
   * 当前是否应该推进时间轴
   */
  shouldAdvanceTime() {
    return this.state === 'PLAYING' && !this.is('PLAYING', 'SCRIPTED');
  }

  /**
   * 监听状态变化
   */
  on(stateName, callback) {
    if (!this.listeners.has(stateName)) {
      this.listeners.set(stateName, []);
    }
    this.listeners.get(stateName).push(callback);
  }

  /**
   * 通知监听器
   */
  _notifyListeners(oldState, oldSub, newState, newSub) {
    // 通知离开旧状态
    const exitKey = `exit:${oldState}`;
    if (this.listeners.has(exitKey)) {
      this.listeners.get(exitKey).forEach(cb => {
        try {
          cb({ from: oldState, fromSub: oldSub, to: newState, toSub: newSub });
        } catch (e) {
          console.error('[FSM] Listener error:', e);
        }
      });
    }

    // 通知进入新状态
    const enterKey = `enter:${newState}`;
    if (this.listeners.has(enterKey)) {
      this.listeners.get(enterKey).forEach(cb => {
        try {
          cb({ from: oldState, fromSub: oldSub, to: newState, toSub: newSub });
        } catch (e) {
          console.error('[FSM] Listener error:', e);
        }
      });
    }
  }

  /**
   * 获取当前状态
   */
  current() {
    return this.state;
  }

  /**
   * 获取当前状态的完整描述（调试用）
   */
  describe() {
    const sub = this.subState ? `.${this.subState}` : '';
    return `${this.state}${sub}`;
  }
}
