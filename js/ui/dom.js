/**
 * VCFM · UI 共享工具
 *
 * 渲染模块共用的 DOM 查询与转义函数。这里只放无状态工具：
 * `world` 是 main.js 的可变绑定（新档/读档会整体替换），渲染模块必须
 * 通过参数接收当前世界，不能从这里 import，否则读档后会指向旧对象。
 */

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => [...document.querySelectorAll(sel)];

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
