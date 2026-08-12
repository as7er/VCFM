/**
 * VCFM · 经理工作台渲染
 *
 * 只负责把 main.js 组装好的待办、快捷操作与推进摘要画到 DOM。
 * `world` 及跨页签状态继续由 main.js 托管，避免读档后持有过期引用。
 */

import { $, escapeHtml } from "./dom.js";
import { getLang } from "../i18n.js";

const SEVERITY_RANK = { critical: 3, warning: 2, info: 1 };

function severityLabel(severity, en) {
  if (severity === "critical") return en ? "Urgent" : "紧急";
  if (severity === "warning") return en ? "Watch" : "关注";
  return en ? "Info" : "提示";
}

function issueHtml(issue, en) {
  const severity = SEVERITY_RANK[issue.severity] ? issue.severity : "info";
  const target = issue.target
    ? `<button type="button" class="btn small ghost dashboard-issue-action" data-dashboard-link="${escapeHtml(issue.target)}">${escapeHtml(issue.actionLabel || (en ? "Open" : "前往处理"))}</button>`
    : "";
  return `<article class="dashboard-priority-item ${severity}">
    <span class="dashboard-priority-icon" aria-hidden="true">${escapeHtml(issue.icon || "•")}</span>
    <div class="dashboard-priority-copy">
      <div class="dashboard-priority-title">
        <span class="dashboard-severity ${severity}">${escapeHtml(severityLabel(severity, en))}</span>
        <strong>${escapeHtml(issue.title || "—")}</strong>
      </div>
      ${issue.detail ? `<p>${escapeHtml(issue.detail)}</p>` : ""}
    </div>
    ${target}
  </article>`;
}

function actionHtml(action) {
  return `<button type="button" class="dashboard-quick-action" data-dashboard-link="${escapeHtml(action.target)}">
    <span class="dashboard-quick-icon" aria-hidden="true">${escapeHtml(action.icon || "→")}</span>
    <span><strong>${escapeHtml(action.label)}</strong>${action.hint ? `<small>${escapeHtml(action.hint)}</small>` : ""}</span>
  </button>`;
}

function digestHtml(digest, en) {
  if (!digest) {
    return `<div class="dashboard-advance-empty">${escapeHtml(en ? "Advance the calendar to see what changed and why it matters." : "推进日期后，这里会汇总关键变化及其影响。")}</div>`;
  }
  const items = (digest.items || []).slice(0, 6);
  return `<div class="dashboard-advance-head">
      <strong>${escapeHtml(en ? `Advanced ${digest.days} day(s)` : `推进 ${digest.days} 天`)}</strong>
      <span>D${Number(digest.startDay) || 0} → D${Number(digest.endDay) || 0}</span>
    </div>
    <div class="dashboard-advance-items">
      ${items
        .map(
          (item) => `<div class="dashboard-advance-item ${escapeHtml(item.severity || "info")}">
            <span aria-hidden="true">${escapeHtml(item.icon || "•")}</span>
            <span><strong>${escapeHtml(item.title || "—")}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</span>
          </div>`
        )
        .join("")}
    </div>`;
}

export function renderManagerWorkbench({ issues = [], actions = [], digest = null } = {}) {
  const en = getLang() === "en";
  const priorityBox = $("#dashboard-priorities");
  const actionBox = $("#dashboard-quick-actions");
  const digestBox = $("#dashboard-advance-summary");
  const status = $("#dashboard-workbench-status");
  if (!priorityBox || !actionBox || !digestBox) return;

  const sorted = [...issues].sort(
    (a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
  );
  const urgent = sorted.filter((item) => item.severity === "critical").length;
  const warning = sorted.filter((item) => item.severity === "warning").length;

  if (status) {
    status.className = `dashboard-workbench-status ${urgent ? "critical" : warning ? "warning" : "ready"}`;
    status.textContent = urgent
      ? en ? `${urgent} urgent` : `${urgent} 项紧急`
      : warning
        ? en ? `${warning} to watch` : `${warning} 项需关注`
        : en ? "Ready" : "准备就绪";
  }

  priorityBox.innerHTML = sorted.length
    ? sorted.slice(0, 5).map((issue) => issueHtml(issue, en)).join("")
    : `<div class="dashboard-priority-empty"><strong>${escapeHtml(en ? "No urgent issues" : "当前没有紧急事项")}</strong><span>${escapeHtml(en ? "The squad is ready for the next decision." : "球队已为下一项决策做好准备。")}</span></div>`;
  actionBox.innerHTML = actions.slice(0, 4).map(actionHtml).join("");
  digestBox.innerHTML = digestHtml(digest, en);
}
