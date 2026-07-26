/**
 * 导演脚本配置
 *
 * 把硬编码的叙事时序（await wait(720) ...）抽到配置对象，
 * 方便调节"慢镜多慢"、"庆祝多久"，且时序与倍速解耦。
 */

/**
 * 进球叙事脚本配置
 * duration: 逻辑持续时间（秒），实际墙钟时间 = duration / speed
 * speed: 播放速度倍率（0.4 = 慢镜 40%）
 */
export const GOAL_NARRATIVE = {
  // 回放模式（包含完整助攻）
  rewatch: {
    phases: [
      { name: 'setup', duration: 0.72, speed: 1.0, camera: 'follow' },
      { name: 'pass', duration: 0.92, speed: 0.6, camera: 'follow', focus: 'passer+scorer' },
      { name: 'receive', duration: 0.48, speed: 0.4, camera: 'box', focus: 'scorer' },
      { name: 'shot', duration: 0.52, speed: 0.4, camera: 'box', focus: 'scorer' },
      { name: 'flight', duration: 0.42, speed: 0.5, camera: 'box' },
      { name: 'net', duration: 1.2, speed: 0.6, camera: 'box', sfx: ['goal', 'cheer'] },
      { name: 'celebrate', duration: 2.6, speed: 0.9, camera: 'wide' }
    ]
  },

  // 禁区外远射
  longRange: {
    phases: [
      { name: 'buildup', duration: 0.48, speed: 1.0, camera: 'follow' },
      { name: 'shot', duration: 0.42, speed: 0.45, camera: 'box', focus: 'scorer' },
      { name: 'flight', duration: 0.56, speed: 0.5, camera: 'box' },
      { name: 'net', duration: 1.1, speed: 0.6, camera: 'box', sfx: ['goal', 'cheer'] },
      { name: 'celebrate', duration: 2.6, speed: 0.9, camera: 'wide' }
    ]
  },

  // 禁区内直接射门
  box: {
    phases: [
      { name: 'receive', duration: 0.28, speed: 1.0, camera: 'box' },
      { name: 'shot', duration: 0.38, speed: 0.42, camera: 'box', focus: 'scorer' },
      { name: 'flight', duration: 0.32, speed: 0.48, camera: 'box' },
      { name: 'net', duration: 1.1, speed: 0.6, camera: 'box', sfx: ['goal', 'cheer'] },
      { name: 'celebrate', duration: 2.4, speed: 0.9, camera: 'wide' }
    ]
  }
};

/**
 * 关键时刻慢镜配置
 */
export const HIGHLIGHT_MOMENTS = {
  // 扑救
  save: {
    lead: 1.8,       // 事件前 lead 秒开始慢镜
    tail: 1.2,       // 事件后 tail 秒结束慢镜
    minSpeed: 0.45,  // 最慢速度
    phases: [
      { range: [-1.8, -0.8], speed: 0.88, camera: 'follow' },
      { range: [-0.8, 0.0], speed: 0.45, camera: 'box', focus: 'keeper' },
      { range: [0.0, 1.2], speed: 0.52, camera: 'box', focus: 'keeper' }
    ]
  },

  // 射门（未进球）
  chance: {
    lead: 1.4,
    tail: 1.0,
    minSpeed: 0.5,
    phases: [
      { range: [-1.4, -0.4], speed: 0.92, camera: 'follow' },
      { range: [-0.4, 0.0], speed: 0.5, camera: 'box', focus: 'shooter' },
      { range: [0.0, 1.0], speed: 0.65, camera: 'box' }
    ]
  },

  // 进球（由 GOAL_NARRATIVE 接管，这里只是占位）
  goal: {
    lead: 2.4,
    tail: 0,
    minSpeed: 0.38
  }
};

/**
 * 导演脚本执行器
 */
export class DirectorScript {
  /**
   * @param {object} config - GOAL_NARRATIVE 或自定义配置
   * @param {object} context - { matchView, eventData }
   */
  constructor(config, context) {
    this.config = config;
    this.context = context;
    this.currentPhaseIndex = 0;
    this.phaseStartTime = 0;
    this.paused = false;
    this.aborted = false;
  }

  /**
   * 执行脚本（返回 Promise）
   */
  async execute() {
    const { matchView } = this.context;
    const { phases } = this.config;

    for (let i = 0; i < phases.length; i++) {
      if (this.aborted) break;

      this.currentPhaseIndex = i;
      const phase = phases[i];
      this.phaseStartTime = performance.now();

      // 应用相机模式
      if (phase.camera) {
        matchView.camMode = phase.camera;
        if (phase.camera === 'box' || phase.camera === 'ball') {
          matchView.camBoostUntil = performance.now() + phase.duration * 1000;
        }
      }

      // 应用焦点
      if (phase.focus) {
        this._applyFocus(phase.focus, phase.duration * 1000);
      }

      // 播放音效
      if (phase.sfx) {
        phase.sfx.forEach(sfx => matchView.playSfx?.(sfx));
      }

      // 等待阶段完成（墙钟时间 = duration / speed）
      const wallClockMs = (phase.duration / phase.speed) * 1000;
      await this._wait(wallClockMs);
    }

    return { completed: !this.aborted };
  }

  /**
   * 应用焦点到球员
   */
  _applyFocus(focusType, durationMs) {
    const { matchView, eventData } = this.context;
    const players = [];

    if (focusType === 'scorer' && eventData.scorerId) {
      const scorer = matchView.players.find(p => p.id === eventData.scorerId);
      if (scorer) players.push(scorer);
    } else if (focusType === 'passer+scorer') {
      if (eventData.assistId) {
        const passer = matchView.players.find(p => p.id === eventData.assistId);
        if (passer) players.push(passer);
      }
      if (eventData.scorerId) {
        const scorer = matchView.players.find(p => p.id === eventData.scorerId);
        if (scorer) players.push(scorer);
      }
    } else if (focusType === 'keeper' && eventData.keeperId) {
      const keeper = matchView.players.find(p => p.id === eventData.keeperId);
      if (keeper) players.push(keeper);
    } else if (focusType === 'shooter' && eventData.shooterId) {
      const shooter = matchView.players.find(p => p.id === eventData.shooterId);
      if (shooter) players.push(shooter);
    }

    if (players.length > 0) {
      matchView._setFocus?.(players, durationMs);
    }
  }

  /**
   * 等待（支持暂停和中止）
   */
  _wait(ms) {
    return new Promise(resolve => {
      const start = performance.now();
      const check = () => {
        if (this.aborted) {
          resolve();
          return;
        }
        if (this.paused) {
          requestAnimationFrame(check);
          return;
        }
        const elapsed = performance.now() - start;
        if (elapsed >= ms) {
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      requestAnimationFrame(check);
    });
  }

  /**
   * 中止脚本
   */
  abort() {
    this.aborted = true;
  }

  /**
   * 暂停/恢复
   */
  setPaused(paused) {
    this.paused = paused;
  }

  /**
   * 获取当前进度
   */
  getProgress() {
    const { phases } = this.config;
    if (!phases || phases.length === 0) return 1;

    let totalDuration = 0;
    let completedDuration = 0;

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      totalDuration += phase.duration;
      if (i < this.currentPhaseIndex) {
        completedDuration += phase.duration;
      } else if (i === this.currentPhaseIndex) {
        const elapsed = (performance.now() - this.phaseStartTime) / 1000;
        const phaseProgress = Math.min(elapsed * phase.speed / phase.duration, 1);
        completedDuration += phase.duration * phaseProgress;
      }
    }

    return totalDuration > 0 ? completedDuration / totalDuration : 1;
  }
}
