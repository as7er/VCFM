/**
 * 回放管理器
 *
 * 管理比赛中的关键时刻录像，支持保存、列表、重播。
 * 配合 DirectorScript 和 compactSimFrame 实现 FM 风格的回放系统。
 */

import { DirectorScript, GOAL_NARRATIVE, HIGHLIGHT_MOMENTS } from './matchview-director.js';

export class ReplayManager {
  constructor() {
    this.highlights = []; // { id, type, time, frames, metadata, thumbnail }
    this.nextId = 1;
    this.autoSaveTypes = new Set(['goal', 'penalty', 'red', 'save']); // 自动保存的事件类型
    this.maxHighlights = 50; // 最多保存 50 个高光
  }

  /**
   * 保存高光时刻
   * @param {string} type - 事件类型（goal, save, chance, penalty, red）
   * @param {Array} frames - compactSimFrame 数组
   * @param {object} metadata - { minute, scorerId, assistId, teamId, text, ... }
   * @returns {string} 高光 ID
   */
  saveHighlight(type, frames, metadata = {}) {
    if (!frames || frames.length === 0) {
      console.warn('[ReplayManager] Cannot save highlight without frames');
      return null;
    }

    // 限制数量
    if (this.highlights.length >= this.maxHighlights) {
      this.highlights.shift(); // 移除最早的
    }

    const id = `highlight_${this.nextId++}`;
    const highlight = {
      id,
      type,
      time: metadata.minute || 0,
      frames,
      metadata,
      thumbnail: this._generateThumbnail(frames, metadata),
      createdAt: Date.now()
    };

    this.highlights.push(highlight);
    return id;
  }

  /**
   * 自动保存（从 match.js 事件流中调用）
   * @param {object} event - { type, minute, playerId, teamId, ... }
   * @param {Array} frames - 录制的帧
   */
  autoSave(event, frames) {
    if (!this.autoSaveTypes.has(event.type)) {
      return null;
    }

    return this.saveHighlight(event.type, frames, {
      minute: event.minute,
      playerId: event.playerId,
      assistId: event.assistId,
      teamId: event.teamId,
      text: event.text,
      score: event.score // { home, away }
    });
  }

  /**
   * 获取所有高光列表
   * @param {object} [filter] - { type?, minTime?, maxTime? }
   * @returns {Array}
   */
  listHighlights(filter = {}) {
    let list = [...this.highlights];

    if (filter.type) {
      list = list.filter(h => h.type === filter.type);
    }

    if (filter.minTime != null) {
      list = list.filter(h => h.time >= filter.minTime);
    }

    if (filter.maxTime != null) {
      list = list.filter(h => h.time <= filter.maxTime);
    }

    // 按时间倒序（最新的在前）
    list.sort((a, b) => b.time - a.time);

    return list.map(h => ({
      id: h.id,
      type: h.type,
      time: h.time,
      thumbnail: h.thumbnail,
      metadata: h.metadata
    }));
  }

  /**
   * 按类型分组
   * @returns {object} { goal: [], save: [], ... }
   */
  listHighlightsByType() {
    const grouped = {};
    for (const h of this.highlights) {
      if (!grouped[h.type]) {
        grouped[h.type] = [];
      }
      grouped[h.type].push({
        id: h.id,
        time: h.time,
        thumbnail: h.thumbnail,
        metadata: h.metadata
      });
    }

    // 每组按时间排序
    Object.values(grouped).forEach(list => {
      list.sort((a, b) => a.time - b.time);
    });

    return grouped;
  }

  /**
   * 获取单个高光
   */
  getHighlight(id) {
    return this.highlights.find(h => h.id === id);
  }

  /**
   * 删除高光
   */
  deleteHighlight(id) {
    const index = this.highlights.findIndex(h => h.id === id);
    if (index >= 0) {
      this.highlights.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 清空所有高光
   */
  clearAll() {
    this.highlights = [];
    this.nextId = 1;
  }

  /**
   * 创建回放脚本
   * @param {string} id - 高光 ID
   * @param {object} context - { matchView, ... }
   * @returns {DirectorScript|null}
   */
  createReplayScript(id, context) {
    const highlight = this.getHighlight(id);
    if (!highlight) {
      console.warn(`[ReplayManager] Highlight ${id} not found`);
      return null;
    }

    // 根据类型选择叙事配置
    let config;
    if (highlight.type === 'goal') {
      // 判断进球深度（禁区外/内/回放）
      const depth = this._inferGoalDepth(highlight.metadata);
      config = GOAL_NARRATIVE[depth] || GOAL_NARRATIVE.box;
    } else if (HIGHLIGHT_MOMENTS[highlight.type]) {
      // 其他关键时刻（扑救、射门等）
      config = this._momentToNarrative(highlight.type, HIGHLIGHT_MOMENTS[highlight.type]);
    } else {
      // 通用回放（简单播放帧）
      config = {
        phases: [
          { name: 'replay', duration: highlight.frames.length * 0.1, speed: 0.8, camera: 'follow' }
        ]
      };
    }

    return new DirectorScript(config, {
      ...context,
      eventData: highlight.metadata,
      isReplay: true
    });
  }

  /**
   * 生成缩略图数据（用于列表显示）
   */
  _generateThumbnail(frames, metadata) {
    // 选择中间帧或关键帧
    const keyFrameIndex = Math.floor(frames.length * 0.6); // 60% 处通常是射门/扑救瞬间
    const frame = frames[keyFrameIndex] || frames[0];

    return {
      minute: metadata.minute || 0,
      score: metadata.score || null,
      text: metadata.text || '',
      // 可以保存球员位置快照，用于生成小地图
      snapshot: frame ? {
        ball: frame.ball,
        players: (frame.players || []).slice(0, 5) // 只保存 5 个关键球员位置
      } : null
    };
  }

  /**
   * 推断进球深度（用于选择叙事配置）
   */
  _inferGoalDepth(metadata) {
    // 如果有 assistId，通常是回放完整过程
    if (metadata.assistId) {
      return 'rewatch';
    }

    // 可以根据射门位置判断（需要从 frames 中提取）
    // 这里简化处理
    return 'box';
  }

  /**
   * 将 HIGHLIGHT_MOMENTS 转换为 DirectorScript 配置
   */
  _momentToNarrative(type, momentConfig) {
    const { lead, tail, minSpeed, phases } = momentConfig;

    return {
      phases: phases.map(p => ({
        name: `${type}_${p.range[0]}`,
        duration: p.range[1] - p.range[0],
        speed: p.speed,
        camera: p.camera,
        focus: p.focus
      }))
    };
  }

  /**
   * 导出所有高光（用于保存到存档）
   */
  export() {
    return {
      highlights: this.highlights.map(h => ({
        id: h.id,
        type: h.type,
        time: h.time,
        metadata: h.metadata,
        thumbnail: h.thumbnail,
        // frames 可以选择性导出（很大）
        framesCount: h.frames.length
      })),
      nextId: this.nextId
    };
  }

  /**
   * 从存档导入（不含 frames，需要重新录制或放弃重播功能）
   */
  import(data) {
    if (!data || !data.highlights) return;

    this.highlights = data.highlights.map(h => ({
      ...h,
      frames: [], // 旧存档不包含帧数据
      createdAt: Date.now()
    }));

    this.nextId = data.nextId || this.highlights.length + 1;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {
      total: this.highlights.length,
      byType: {}
    };

    for (const h of this.highlights) {
      if (!stats.byType[h.type]) {
        stats.byType[h.type] = 0;
      }
      stats.byType[h.type]++;
    }

    return stats;
  }
}

/**
 * 回放 UI 助手（可选，用于快速生成回放列表 HTML）
 */
export class ReplayUI {
  constructor(replayManager, container) {
    this.manager = replayManager;
    this.container = container;
    this.onPlayCallback = null;
  }

  /**
   * 渲染回放列表
   */
  render() {
    const highlights = this.manager.listHighlights();
    if (highlights.length === 0) {
      this.container.innerHTML = '<div class="replay-empty">暂无精彩回放</div>';
      return;
    }

    const html = highlights.map(h => this._renderHighlightItem(h)).join('');
    this.container.innerHTML = `<div class="replay-list">${html}</div>`;

    // 绑定点击事件
    this.container.querySelectorAll('.replay-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (this.onPlayCallback) {
          this.onPlayCallback(id);
        }
      });
    });
  }

  /**
   * 渲染单个高光项
   */
  _renderHighlightItem(highlight) {
    const { id, type, time, thumbnail, metadata } = highlight;
    const typeLabel = this._getTypeLabel(type);
    const icon = this._getTypeIcon(type);
    const score = thumbnail.score ? `${thumbnail.score.home}-${thumbnail.score.away}` : '';

    return `
      <div class="replay-item" data-id="${id}" data-type="${type}">
        <div class="replay-icon">${icon}</div>
        <div class="replay-info">
          <div class="replay-time">${time}'</div>
          <div class="replay-type">${typeLabel}</div>
          <div class="replay-text">${thumbnail.text || ''}</div>
          ${score ? `<div class="replay-score">${score}</div>` : ''}
        </div>
      </div>
    `;
  }

  _getTypeLabel(type) {
    const labels = {
      goal: '⚽ 进球',
      save: '🧤 扑救',
      chance: '💥 射门',
      penalty: '❗ 点球',
      red: '🟥 红牌',
      corner: '🚩 角球'
    };
    return labels[type] || type;
  }

  _getTypeIcon(type) {
    const icons = {
      goal: '⚽',
      save: '🧤',
      chance: '💥',
      penalty: '❗',
      red: '🟥',
      corner: '🚩'
    };
    return icons[type] || '📹';
  }

  /**
   * 监听回放按钮点击
   */
  onPlay(callback) {
    this.onPlayCallback = callback;
  }
}
