/**
 * Canvas 渲染优化器
 *
 * 优化 matchview 的 Canvas 重绘性能：
 * 1. 分层 Canvas（静态层 + 动态层）
 * 2. 脏矩形检测（只重绘变化区域）
 * 3. 离屏缓存（球员精灵预渲染）
 */

export class CanvasRenderer {
  constructor() {
    // 分层 Canvas
    this.layers = {
      bg: null,      // 背景层：草坪纹理、阵型区（很少变化）
      field: null,   // 场地层：球员、球、阴影（每帧变化）
      ui: null       // UI 层：轨迹、焦点光圈、特效（按需更新）
    };

    this.contexts = {};
    this.dirtyRects = [];
    this.spriteCache = new Map(); // 预渲染的球员精灵

    // 性能监控
    this.stats = {
      fullRedraws: 0,
      partialRedraws: 0,
      cachedSprites: 0
    };

    // 启用优化开关
    this.enableDirtyRect = true;  // 脏矩形优化（低端设备可能更慢）
    this.enableSpriteCache = true; // 精灵缓存
  }

  /**
   * 初始化多层 Canvas
   * @param {HTMLElement} container
   * @param {number} width
   * @param {number} height
   */
  initLayers(container, width, height) {
    const pixelRatio = window.devicePixelRatio || 1;

    ['bg', 'field', 'ui'].forEach((name, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: ${idx};
        pointer-events: none;
      `;
      container.appendChild(canvas);

      this.layers[name] = canvas;
      const ctx = canvas.getContext('2d', { alpha: name !== 'bg' });
      ctx.scale(pixelRatio, pixelRatio);
      this.contexts[name] = ctx;
    });

    return this.layers;
  }

  /**
   * 绘制背景层（只在需要时调用）
   * @param {Function} drawFn - (ctx, width, height) => void
   */
  drawBackground(drawFn) {
    const ctx = this.contexts.bg;
    const canvas = this.layers.bg;
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawFn(ctx, canvas.width, canvas.height);
  }

  /**
   * 绘制场地层（每帧调用）
   * @param {Function} drawFn
   * @param {Array<{x,y,w,h}>} dirtyRects - 脏矩形列表（可选）
   */
  drawField(drawFn, dirtyRects = null) {
    const ctx = this.contexts.field;
    const canvas = this.layers.field;
    if (!ctx || !canvas) return;

    if (this.enableDirtyRect && dirtyRects && dirtyRects.length > 0) {
      // 只重绘脏矩形区域
      dirtyRects.forEach(rect => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();
        ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
        drawFn(ctx, canvas.width, canvas.height, rect);
        ctx.restore();
      });
      this.stats.partialRedraws++;
    } else {
      // 全量重绘
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawFn(ctx, canvas.width, canvas.height);
      this.stats.fullRedraws++;
    }
  }

  /**
   * 绘制 UI 层（按需调用）
   */
  drawUI(drawFn, clear = true) {
    const ctx = this.contexts.ui;
    const canvas = this.layers.ui;
    if (!ctx || !canvas) return;

    if (clear) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    drawFn(ctx, canvas.width, canvas.height);
  }

  /**
   * 计算球员移动的脏矩形
   * @param {Array} players - [{x,y,prevX,prevY}]
   * @param {number} margin - 扩展边距（包含阴影等）
   * @returns {Array<{x,y,w,h}>}
   */
  calculateDirtyRects(players, margin = 20) {
    const rects = [];
    const pixelRatio = window.devicePixelRatio || 1;

    players.forEach(pl => {
      if (!pl.prevX || !pl.prevY) {
        // 首次出现，整个球员区域都是脏的
        rects.push({
          x: (pl.x - margin) * pixelRatio,
          y: (pl.y - margin) * pixelRatio,
          w: margin * 2 * pixelRatio,
          h: margin * 2 * pixelRatio
        });
        return;
      }

      // 移动区域：旧位置 + 新位置的并集
      const minX = Math.min(pl.prevX, pl.x) - margin;
      const minY = Math.min(pl.prevY, pl.y) - margin;
      const maxX = Math.max(pl.prevX, pl.x) + margin;
      const maxY = Math.max(pl.prevY, pl.y) + margin;

      rects.push({
        x: minX * pixelRatio,
        y: minY * pixelRatio,
        w: (maxX - minX) * pixelRatio,
        h: (maxY - minY) * pixelRatio
      });
    });

    return this._mergeOverlappingRects(rects);
  }

  /**
   * 合并重叠的脏矩形（减少绘制次数）
   */
  _mergeOverlappingRects(rects) {
    if (rects.length <= 1) return rects;

    const merged = [];
    const used = new Set();

    for (let i = 0; i < rects.length; i++) {
      if (used.has(i)) continue;

      let current = { ...rects[i] };
      let changed = true;

      while (changed) {
        changed = false;
        for (let j = i + 1; j < rects.length; j++) {
          if (used.has(j)) continue;

          const other = rects[j];
          if (this._rectsOverlap(current, other)) {
            current = this._mergeRects(current, other);
            used.add(j);
            changed = true;
          }
        }
      }

      merged.push(current);
      used.add(i);
    }

    return merged;
  }

  _rectsOverlap(r1, r2) {
    return !(
      r1.x + r1.w < r2.x ||
      r2.x + r2.w < r1.x ||
      r1.y + r1.h < r2.y ||
      r2.y + r2.h < r1.y
    );
  }

  _mergeRects(r1, r2) {
    const x = Math.min(r1.x, r2.x);
    const y = Math.min(r1.y, r2.y);
    const maxX = Math.max(r1.x + r1.w, r2.x + r2.w);
    const maxY = Math.max(r1.y + r1.h, r2.y + r2.h);
    return { x, y, w: maxX - x, h: maxY - y };
  }

  /**
   * 预渲染球员精灵到缓存
   * @param {string} key - 缓存键（如 "home-10-highlighted"）
   * @param {Function} drawFn - (ctx, size) => void
   * @param {number} size - 精灵尺寸
   */
  cacheSprite(key, drawFn, size = 64) {
    if (!this.enableSpriteCache) return null;
    if (this.spriteCache.has(key)) {
      return this.spriteCache.get(key);
    }

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { alpha: true });

    drawFn(ctx, size);

    this.spriteCache.set(key, canvas);
    this.stats.cachedSprites++;
    return canvas;
  }

  /**
   * 绘制缓存的精灵
   */
  drawSprite(ctx, spriteKey, x, y, scale = 1) {
    const sprite = this.spriteCache.get(spriteKey);
    if (!sprite) return false;

    const w = sprite.width * scale;
    const h = sprite.height * scale;
    ctx.drawImage(sprite, x - w / 2, y - h / 2, w, h);
    return true;
  }

  /**
   * 清除精灵缓存（换人、换球衣时调用）
   */
  clearSpriteCache() {
    this.spriteCache.clear();
  }

  /**
   * 调整所有层的尺寸
   */
  resize(width, height) {
    const pixelRatio = window.devicePixelRatio || 1;

    Object.values(this.layers).forEach(canvas => {
      if (!canvas) return;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    });

    // 重新设置 scale
    Object.entries(this.contexts).forEach(([name, ctx]) => {
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(pixelRatio, pixelRatio);
      }
    });

    // 缓存失效
    this.clearSpriteCache();
  }

  /**
   * 获取性能统计
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats.fullRedraws = 0;
    this.stats.partialRedraws = 0;
    this.stats.cachedSprites = 0;
  }

  /**
   * 销毁
   */
  destroy() {
    Object.values(this.layers).forEach(canvas => {
      if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    });
    this.layers = {};
    this.contexts = {};
    this.spriteCache.clear();
  }
}
