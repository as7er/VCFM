/**
 * VCFM · 媒体页渲染
 *
 * 从 main.js 拆出。世界对象由调用方传入（main.js 的 `world` 是可变绑定，
 * 读档会整体替换，这里 import 会拿到过期引用）。
 */

import { $, escapeHtml } from "./dom.js";
import { ensureMedia } from "../media.js";

/**
 * @param {object} world
 * @param {boolean} en
 * @param {(key: string, vars?: object) => string} t i18n 取词函数
 */
export function renderMedia(world, en, t) {
  if (!world) return;
  ensureMedia(world);
  const feed = $("#media-feed");
  if (!feed) return;
  const list = world.media || [];
  const countEl = $("#media-count");
  if (countEl) countEl.textContent = t("media.count", { n: list.length });
  feed.innerHTML = list.length
    ? list
        .map((a) => {
          const tone = a.tone || "neutral";
          return `<article class="media-card ${tone}">
            <div class="outlet">
              <span>${escapeHtml(a.outlet || (en ? "Media" : "媒体"))}</span>
              <span>S${a.season || world.season} · D${a.day ?? "—"}</span>
            </div>
            <h3>${escapeHtml(a.headline)}</h3>
            <p class="body">${escapeHtml(a.body || "")}</p>
          </article>`;
        })
        .join("")
    : `<p class="muted">${en ? "No stories yet. Matches, transfers and calendar progress will populate this feed." : "暂无报道。比赛、转会、推进日程后会出现媒体内容。"}</p>`;
}
