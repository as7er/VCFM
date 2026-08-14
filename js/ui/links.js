/**
 * VCFM · 共享渲染工具：可点击的俱乐部 / 球员链接
 *
 * 这些片段在 main.js 有近 60 处调用，也被各页签模块复用，因此放在共享层。
 * `clubLinkHtml` 需要按 id 查俱乐部，但 main.js 的 `world` 是可变绑定
 * （读档整体替换），所以这里通过 setLinkWorldSource 注入一个取值函数，
 * 而不是持有 world 本身。
 */

import { escapeHtml } from "./dom.js";
import { getLang } from "../i18n.js";
import { localizedClubName, localizedClubShortName } from "../branding.js";
import { clubCrestHtml } from "../club-crest.js?v=215";

let readWorld = () => null;

/** main.js 启动时注入；传取值函数而非 world 本身，读档后自动跟随新对象 */
export function setLinkWorldSource(fn) {
  readWorld = typeof fn === "function" ? fn : () => null;
}

export function clubDisplayName(club) {
  return localizedClubName(club, getLang()) || club?.name || "—";
}

export function clubDisplayShortName(club) {
  return localizedClubShortName(club, getLang()) || clubDisplayName(club);
}

/** 可点击俱乐部名 → showClubModal（全局 data-club-link 委托） */
export function clubLinkHtml(clubId, label, extraClass = "") {
  const club = readWorld()?.clubs?.find((c) => c.id === clubId);
  const fullName = clubDisplayName(club);
  const defaultName =
    label == null || label === club?.name || label === club?.nameZh || label === club?.nameEn;
  const codeName = label === club?.shortName || label === club?.shortCode;
  const name = defaultName
    ? fullName
    : codeName
      ? clubDisplayShortName(club)
      : label;
  const title = name !== fullName ? ` title="${escapeHtml(fullName)}" aria-label="${escapeHtml(fullName)}"` : "";
  const crest = club
    ? clubCrestHtml(club, {
        size: extraClass.includes("compact") ? 16 : 18,
        className: "club-link-crest",
        decorative: true,
        lazy: true,
      })
    : "";
  return `<button type="button" class="club-link ${extraClass}" data-club-link="${escapeHtml(clubId)}"${title}>${crest}<span class="club-link-label">${escapeHtml(name)}</span></button>`;
}

/** 可点击球员名 → showPlayerModal（全局 data-player-link 委托） */
export function playerLinkHtml(playerId, label, extraClass = "", context = null) {
  if (!playerId) return escapeHtml(label ?? "—");
  const nationAttrs = context?.nationCode
    ? ` data-player-nation="${escapeHtml(context.nationCode)}"${context.squadNumber != null ? ` data-player-number="${Number(context.squadNumber)}"` : ""}`
    : "";
  const browseAttrs = context?.browseType && context?.browseId
    ? ` data-player-browse="${escapeHtml(context.browseType)}" data-player-browse-id="${escapeHtml(context.browseId)}"${context.competitionId ? ` data-player-competition="${escapeHtml(context.competitionId)}"` : ""}`
    : "";
  return `<button type="button" class="player-link ${extraClass}" data-player-link="${escapeHtml(playerId)}"${nationAttrs}${browseAttrs}>${escapeHtml(label ?? "?")}</button>`;
}
