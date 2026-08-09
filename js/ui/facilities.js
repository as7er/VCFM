/**
 * VCFM · 设施页渲染
 *
 * 从 main.js 拆出。世界对象由调用方传入（main.js 的 `world` 是可变绑定，
 * 读档会整体替换，这里 import 会拿到过期引用）。
 */

import { $, escapeHtml } from "./dom.js";
import { formatMoney, YOUTH_LEVELS, YOUTH_UPGRADE_COST } from "../models.js";
import {
  ensureFacilities,
  stadiumInfo,
  trainingFacilityInfo,
  youthFacilityInfo,
  getProject,
  facilitySummaryLine,
  FACILITY_MAX,
  STADIUM_LEVELS,
  TRAINING_FACILITY_LEVELS,
  FACILITY_LABELS,
} from "../facilities.js";

/**
 * @param {object} world
 * @param {object} club 用户俱乐部
 * @param {boolean} en
 * @param {(key: string, vars?: object) => string} t i18n 取词函数
 */
export function renderFacilities(world, club, en, t) {
  if (!world || !club) return;
  ensureFacilities(club);
  const grid = $("#facilities-grid");
  if (!grid) return;

  const items = [
    {
      kind: "stadium",
      icon: "🏟️",
      info: stadiumInfo(club),
      effect: (i) =>
        en ? `Capacity ~${i.capacity.toLocaleString()} · Matchday ~${formatMoney(i.matchday)} · Weekly upkeep ${formatMoney(i.upkeep)}` : `容量约 ${i.capacity.toLocaleString()} · 主场收入约 ${formatMoney(i.matchday)}/场 · 周维护 ${formatMoney(i.upkeep)}`,
      nextEffect: (lv) => {
        const n = STADIUM_LEVELS[lv];
        return n
          ? en ? `→ Capacity ${n.capacity.toLocaleString()} · Income ~${formatMoney(n.matchday)}` : `→ 容量 ${n.capacity.toLocaleString()} · 收入约 ${formatMoney(n.matchday)}`
          : "";
      },
    },
    {
      kind: "training",
      icon: "🏋️",
      info: trainingFacilityInfo(club),
      effect: (i) =>
        en ? `Growth +${Math.round((i.growth || 0) * 1000) / 10}% · Recovery +${i.heal} · Injury ×${i.injuryMod} · Weekly upkeep ${formatMoney(i.upkeep)}` : `成长+${Math.round((i.growth || 0) * 1000) / 10}% · 恢复+${i.heal} · 伤病×${i.injuryMod} · 周维护 ${formatMoney(i.upkeep)}`,
      nextEffect: (lv) => {
        const n = TRAINING_FACILITY_LEVELS[lv];
        return n ? (en ? `→ Growth +${Math.round(n.growth * 1000) / 10}% · Recovery +${n.heal}` : `→ 成长+${Math.round(n.growth * 1000) / 10}% · 恢复+${n.heal}`) : "";
      },
    },
    {
      kind: "youth",
      icon: "🌱",
      info: youthFacilityInfo(club),
      effect: (i) =>
        en ? `Capacity ${i.capacity} · Intake ${i.intake} · Growth ${i.growth} · Weekly upkeep ${formatMoney(i.upkeep)}` : `容量 ${i.capacity} · 招生 ${i.intake}/期 · 成长 ${i.growth} · 周维护 ${formatMoney(i.upkeep)}`,
      nextEffect: (lv) => {
        const n = YOUTH_LEVELS[lv];
        return n ? (en ? `→ Youth academy Lv.${lv} · Capacity ${n.capacity} · Intake ${n.intake}` : `→ ${n.name} · 容量 ${n.capacity} · 招生 ${n.intake}`) : "";
      },
    },
  ];

  const costs = {
    stadium: { 2: 3e6, 3: 8e6, 4: 18e6, 5: 40e6 },
    training: { 2: 1.5e6, 3: 4e6, 4: 10e6, 5: 22e6 },
    youth: YOUTH_UPGRADE_COST,
  };
  const buildDays = {
    stadium: { 2: 14, 3: 21, 4: 28, 5: 35 },
    training: { 2: 10, 3: 14, 4: 21, 5: 28 },
    youth: { 2: 12, 3: 18, 4: 24, 5: 30 },
  };

  grid.innerHTML = items
    .map(({ kind, icon, info, effect, nextEffect }) => {
      const lv = info.level;
      const proj = getProject(club, kind);
      const label = en ? ({ stadium: "Stadium", training: "Training facilities", youth: "Youth facilities" }[kind] || kind) : FACILITY_LABELS[kind] || kind;
      let action = "";
      if (proj) {
        const left = Math.max(0, proj.finishDay - world.day);
        action = `<button class="btn small" disabled>${t("fac.building", { n: left })}</button>
          <p class="hint" style="margin:0.4rem 0 0">${en ? "Target" : "目标"} Lv.${proj.to}${en ? "" : ` ${escapeHtml(proj.name)}`}</p>`;
      } else if (lv >= FACILITY_MAX) {
        action = `<button class="btn small" disabled>${t("fac.maxed")}</button>`;
      } else {
        const next = lv + 1;
        const cost = costs[kind][next];
        const days = buildDays[kind][next];
        const verbKey =
          kind === "stadium" ? (next >= 4 ? "fac.buildNew" : "fac.expand") : "fac.upgrade";
        action = `<button class="btn small primary" data-upgrade-facility="${kind}">${t(verbKey, {
          lv: next,
          cost: formatMoney(cost),
          days,
        })}</button>
          <p class="hint" style="margin:0.4rem 0 0">${escapeHtml(nextEffect(next))}</p>`;
      }
      return `<div class="facility-card">
        <div class="facility-title">${icon} ${label}</div>
        <div class="facility-level">Lv.${lv}${en ? "" : ` · ${escapeHtml(info.name)}`}</div>
        <p class="facility-effect">${escapeHtml(effect(info))}</p>
        ${action}
      </div>`;
    })
    .join("");

  const hint = $("#facilities-hint");
  if (hint) {
    hint.textContent = en
      ? `Stadium Lv.${club.facilities.stadium} · Training Lv.${club.facilities.training} · Youth Lv.${club.facilities.youth} · Home matches generate gate income; training level affects development and injuries.`
      : facilitySummaryLine(club) + " · 主场比赛自动计入门票收入（概览财政可见累计）；训练等级影响日常训练与伤病。";
  }
}
