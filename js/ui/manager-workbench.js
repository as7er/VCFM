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

function onboardingHtml(onboarding, en) {
  if (!onboarding) return "";
  const current = onboarding.steps.find((step) => !step.done);
  return `<div class="dashboard-onboarding" aria-labelledby="dashboard-onboarding-title">
    <div class="dashboard-onboarding-head">
      <div>
        <span class="dashboard-eyebrow">${escapeHtml(en ? "First week" : "首周引导")}</span>
        <h2 id="dashboard-onboarding-title">${escapeHtml(en ? "Build your first match plan" : "完成第一场比赛准备")}</h2>
      </div>
      <span class="dashboard-onboarding-progress">${onboarding.completed}/${onboarding.total}</span>
    </div>
    <p class="dashboard-onboarding-intro">${escapeHtml(en ? "Four short checks are enough to get started. You can skip this guide at any time." : "先完成四个简短检查，熟悉球队后再推进日程。随时可以跳过引导。")}</p>
    <div class="dashboard-onboarding-steps">
      ${onboarding.steps.map((step) => {
        const action = step.id === "match"
          ? `<button type="button" class="btn small ghost" data-dashboard-onboarding-match>${escapeHtml(en ? step.actionEn : step.action)}</button>`
          : `<button type="button" class="btn small ghost" data-dashboard-link="${escapeHtml(step.tab)}">${escapeHtml(en ? step.actionEn : step.action)}</button>`;
        return `<div class="dashboard-onboarding-step ${step.done ? "done" : step === current ? "current" : ""}">
          <span class="dashboard-onboarding-icon" aria-hidden="true">${escapeHtml(step.icon)}</span>
          <div class="dashboard-onboarding-copy">
            <strong>${escapeHtml(en ? step.titleEn : step.title)}</strong>
            <small>${escapeHtml(en ? step.detailEn : step.detail)}</small>
          </div>
          <span class="dashboard-onboarding-state">${step.done ? escapeHtml(en ? "Done" : "已完成") : action}</span>
        </div>`;
      }).join("")}
    </div>
    <button type="button" class="btn small ghost dashboard-onboarding-dismiss" data-dashboard-onboarding-dismiss>${escapeHtml(en ? "Skip guide" : "跳过引导")}</button>
  </div>`;
}

export function renderManagerWorkbench({ issues = [], actions = [], digest = null, onboarding = null } = {}) {
  const en = getLang() === "en";
  const priorityBox = $("#dashboard-priorities");
  const actionBox = $("#dashboard-quick-actions");
  const digestBox = $("#dashboard-advance-summary");
  const onboardingBox = $("#dashboard-onboarding");
  const status = $("#dashboard-workbench-status");
  const focusBox = $("#dashboard-focus");
  if (!priorityBox || !actionBox || !digestBox) return;

  const sorted = [...issues].sort(
    (a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
  );
  const urgent = sorted.filter((item) => item.severity === "critical").length;
  const warning = sorted.filter((item) => item.severity === "warning").length;

  // 今日焦点:把最高优先级的一件事放大到行首,给整页一个明确的当下动作。
  if (focusBox && sorted.length) {
    const focus = sorted[0];
    focusBox.className = `dashboard-focus ${focus.severity === "critical" ? "critical" : focus.severity === "warning" ? "warning" : "info"}`;
    focusBox.hidden = false;
    focusBox.innerHTML = `
      <span class="dashboard-focus-icon" aria-hidden="true">${escapeHtml(focus.icon || "•")}</span>
      <div class="dashboard-focus-copy">
        <span class="dashboard-focus-kicker">${escapeHtml(severityLabel(focus.severity, en))} · ${escapeHtml(en ? "Focus" : "现在")}</span>
        <div class="dashboard-focus-title">${escapeHtml(focus.title || (en ? "No focus yet" : "暂无重点"))}</div>
        ${focus.detail ? `<div class="dashboard-focus-detail">${escapeHtml(focus.detail)}</div>` : ""}
      </div>
      ${focus.target ? `<div class="dashboard-focus-action"><button type="button" class="btn small primary" data-dashboard-link="${escapeHtml(focus.target)}">${escapeHtml(focus.actionLabel || (en ? "Open" : "前往处理"))}</button></div>` : ""}
    `;
  } else if (focusBox) {
    focusBox.hidden = true;
    focusBox.innerHTML = "";
  }

  if (status) {
    status.className = `dashboard-workbench-status ${urgent ? "critical" : warning ? "warning" : "ready"}`;
    status.textContent = urgent
      ? en ? `${urgent} urgent` : `${urgent} 项紧急`
      : warning
        ? en ? `${warning} to watch` : `${warning} 项需关注`
        : en ? "Ready" : "准备就绪";
  }

  // 今日焦点已经放大过最重要的一条,列表只展示其余待办,避免同一事项在一屏出现两次。
  const list = sorted.slice(1, 5);
  priorityBox.innerHTML = list.length
    ? list.map((issue) => issueHtml(issue, en)).join("")
    : `<div class="dashboard-priority-empty${sorted.length ? " dashboard-priority-empty-secondary" : ""}"><strong>${escapeHtml(sorted.length ? (en ? "No other pending issues" : "暂无其他待办") : (en ? "No urgent issues" : "当前没有紧急事项"))}</strong><span>${escapeHtml(sorted.length ? (en ? "The focus above is the only decision waiting for you." : "上方重点事项是当前唯一等待处理的决定。") : (en ? "The squad is ready for the next decision." : "球队已为下一项决策做好准备。") )}</span></div>`;
  actionBox.innerHTML = actions.slice(0, 4).map(actionHtml).join("");
  digestBox.innerHTML = digestHtml(digest, en);
  if (onboardingBox) {
    onboardingBox.innerHTML = onboardingHtml(onboarding, en);
    onboardingBox.hidden = !onboarding;
  }
}
