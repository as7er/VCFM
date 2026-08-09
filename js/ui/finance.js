/**
 * VCFM · 财政页渲染
 *
 * 从 main.js 拆出，只负责把财政数据画到 DOM。
 * 世界对象由调用方传入（main.js 的 `world` 是可变绑定，读档会整体替换，
 * 这里 import 会拿到过期引用）；账目筛选状态同理由调用方托管。
 */

import { $, escapeHtml } from "./dom.js";
import { formatMoney } from "../models.js";
import { financeLedgerSummary } from "../finance-ledger.js";
import { clubSeasonBudgetSnapshot } from "../club-finance.js";
import { sponsorshipSnapshot } from "../sponsorships.js";
import { financeSnapshot } from "../worldpulse.js";

export const FINANCE_CATEGORY_ORDER = [
  "ticket",
  "matchday",
  "commercial",
  "broadcast",
  "prize",
  "competition",
  "league",
  "financing",
  "transfer",
  "loan",
  "wage",
  "facility",
  "contract",
  "staff",
  "scouting",
  "board",
  "other",
];

export function financeCategoryLabel(category, en) {
  const labels = {
    ticket: ["门票", "Tickets"],
    matchday: ["比赛日附加", "Matchday ancillary"],
    commercial: ["商业", "Commercial"],
    broadcast: ["转播", "Broadcast"],
    prize: ["奖金", "Prize money"],
    competition: ["赛事", "Competitions"],
    league: ["联赛流动", "League transition"],
    financing: ["融资", "Financing"],
    transfer: ["转会", "Transfers"],
    loan: ["租借", "Loans"],
    wage: ["薪资", "Wages"],
    facility: ["设施", "Facilities"],
    contract: ["合同", "Contracts"],
    staff: ["职员", "Staff"],
    scouting: ["球探", "Scouting"],
    board: ["董事会", "Board"],
    other: ["其他", "Other"],
  };
  const pair = labels[category] || [category || "其他", category || "Other"];
  return en ? pair[1] : pair[0];
}

export function financeSourceLabel(source, en) {
  const labels = {
    legacy: ["期初迁移", "Opening migration"],
    "weekly-settlement": ["俱乐部周结算", "Weekly club settlement"],
    "sponsorship-weekly": ["主赞助周收入", "Weekly sponsorship"],
    "commercial-operations": ["其他商业经营", "Other commercial operations"],
    "sponsorship-signing": ["赞助签约金", "Sponsorship signing payment"],
    "sponsorship-performance": ["赞助表现奖金", "Sponsorship performance bonus"],
    matchday: ["主场比赛日", "Home matchday"],
    "matchday-ticket": ["比赛门票", "Match tickets"],
    "matchday-retail": ["餐饮与零售", "Food, beverage and retail"],
    "matchday-hospitality": ["商务接待", "Hospitality"],
    "transfer-fee": ["球员转会费", "Player transfer fee"],
    "transfer-upfront": ["转会首付款", "Transfer upfront payment"],
    "ai-transfer-upfront": ["俱乐部转会首付款", "Club transfer upfront payment"],
    "transfer-installment": ["转会分期付款", "Transfer installment"],
    "transfer-appearance-bonus": ["转会出场奖金", "Transfer appearance bonus"],
    "transfer-sell-on": ["二次转售分成", "Sell-on share"],
    "training-solidarity": ["青训培养补偿", "Training solidarity contribution"],
    "signing-bonus": ["球员签约奖", "Player signing bonus"],
    "ai-transfer": ["俱乐部间转会", "Club transfer"],
    "poach-sale": ["挖角成交", "Accepted transfer bid"],
    "loan-fee": ["球员租借费", "Player loan fee"],
    "loan-recall": ["窗外召回费", "Loan recall fee"],
    "facility-upgrade": ["设施建设", "Facility project"],
    "season-broadcast": ["赛季转播分成", "Season broadcast share"],
    "season-prize": ["联赛名次奖金", "League prize money"],
    "competition-participation": ["洲际参赛分成", "Continental participation"],
    "competition-quarter-final": ["洲际八强奖金", "Continental quarter-final bonus"],
    "domestic-cup-prize": ["国内杯晋级奖金", "Domestic cup progress prize"],
    "domestic-cup-runner-up": ["国内杯亚军奖金", "Domestic cup runner-up prize"],
    "continental-match-win": ["洲际胜场奖金", "Continental win bonus"],
    "continental-match-draw": ["洲际平局奖金", "Continental draw bonus"],
    "continental-progress-prize": ["洲际晋级奖金", "Continental progress prize"],
    "continental-runner-up": ["洲际亚军奖金", "Continental runner-up prize"],
    "promotion-support": ["升级筹备支持", "Promotion support"],
    "relegation-parachute": ["降级缓冲金", "Relegation parachute payment"],
    "bank-financing": ["银行融资到账", "Bank financing received"],
    "debt-interest": ["融资利息", "Financing interest"],
    "debt-principal": ["偿还本金", "Principal repayment"],
    "contract-renewal": ["球员续约", "Player renewal"],
    "contract-termination": ["球员解约补偿", "Player release compensation"],
    "free-agent-signing": ["自由球员签约", "Free-agent signing"],
    "staff-termination": ["职员解约补偿", "Staff termination"],
    "manager-dismissal": ["主教练解雇补偿", "Head-coach dismissal"],
    "staff-signing": ["自由职员签约", "Free staff signing"],
    "staff-poach": ["职员挖角", "Staff approach"],
    "staff-market-refresh": ["刷新职员市场", "Staff market refresh"],
    "scout-mission": ["球探任务", "Scout assignment"],
    "board-bonus": ["董事会目标奖金", "Board objective bonus"],
    "board-fine": ["董事会罚款", "Board fine"],
    system: ["系统结算", "System settlement"],
  };
  const pair = labels[source] || [source || "其他结算", source || "Other transaction"];
  return en ? pair[1] : pair[0];
}

export function financeCategoryBadge(category, en) {
  const safe = String(category || "other").replace(/[^a-z0-9_-]/gi, "");
  return `<span class="finance-category-label"><span class="finance-category-dot finance-cat-${safe}"></span>${escapeHtml(financeCategoryLabel(category, en))}</span>`;
}

/**
 * @param {object} world
 * @param {object} club 用户俱乐部
 * @param {boolean} en
 * @param {{ ledgerFilter: string, onFilterReset: (next: string) => void }} opts
 *   ledgerFilter 由 main.js 托管（筛选器的 change 事件写入）；分类失效时
 *   通过 onFilterReset 回写，避免本模块持有跨页签状态。
 */
export function renderFinance(world, club, en, opts = {}) {
  if (!world || !club) return;
  const { ledgerFilter = "all", onFilterReset } = opts;
  const snapshot = financeSnapshot(world);
  const budget = clubSeasonBudgetSnapshot(world, club);
  const ledger = financeLedgerSummary(club, world.season);
  if (!snapshot || !budget) return;
  renderSponsorship(world, club, en);
  renderDebtFinance(club, budget, en);

  const statusLabels = {
    stable: en ? "Stable" : "稳健",
    tight: en ? "Tight" : "偏紧",
    critical: en ? "Critical" : "告急",
  };
  const statusEl = $("#finance-status");
  if (statusEl) {
    statusEl.textContent = statusLabels[budget.status] || statusLabels.stable;
    statusEl.className = `finance-status ${budget.status}`;
  }

  const metrics = $("#finance-metrics");
  if (metrics) {
    const runway = snapshot.weeksCover >= 99 ? "99+" : String(snapshot.weeksCover);
    metrics.innerHTML = `
      <div><span>${en ? "Cash" : "现金余额"}</span><strong>${formatMoney(snapshot.money)}</strong></div>
      <div><span>${en ? "Season net" : "本季净额"}</span><strong class="${snapshot.seasonNetApprox >= 0 ? "stat-high" : "stat-low"}">${formatMoney(snapshot.seasonNetApprox)}</strong></div>
      <div><span>${en ? "Weekly operation" : "每周运营"}</span><strong>${formatMoney(snapshot.weekly)}</strong></div>
      <div><span>${en ? "Runway" : "资金续航"}</span><strong>${runway} ${en ? "weeks" : "周"}</strong></div>`;
  }

  const reserveInput = $("#finance-reserve-weeks");
  const shareInput = $("#finance-transfer-share");
  if (reserveInput) reserveInput.value = String(budget.plan.reserveWeeks);
  if (shareInput) shareInput.value = String(budget.plan.transferShare);
  const reserveValue = $("#finance-reserve-weeks-value");
  const shareValue = $("#finance-transfer-share-value");
  if (reserveValue) reserveValue.textContent = `${budget.plan.reserveWeeks} ${en ? "weeks" : "周"}`;
  if (shareValue) shareValue.textContent = `${budget.plan.transferShare}%`;
  const seasonEl = $("#finance-budget-season");
  if (seasonEl) seasonEl.textContent = en ? `Season ${world.season}` : `${world.season} 赛季`;

  const projection = $("#finance-budget-projection");
  if (projection) {
    const wageShare = budget.wageShare >= 999 ? "999%+" : `${budget.wageShare}%`;
    projection.innerHTML = `
      <div><span>${en ? "Cash reserve" : "现金储备"}</span><strong>${formatMoney(budget.reserveCash)}</strong></div>
      <div><span>${en ? "Committed cash" : "已承诺现金"}</span><strong class="${budget.commitments.total > 0 ? "stat-low" : "stat-high"}">${formatMoney(budget.commitments.total)}</strong></div>
      <div><span>${en ? "Committed weekly wages" : "已承诺周薪"}</span><strong class="${budget.commitments.weeklyWageIncrease > 0 ? "stat-low" : "stat-high"}">${formatMoney(budget.commitments.weeklyWageIncrease)}</strong></div>
      <div><span>${en ? "Remaining wage impact" : "本季工资影响"}</span><strong class="${budget.projectedCommittedWages > 0 ? "stat-low" : "stat-high"}">${formatMoney(budget.projectedCommittedWages)}</strong></div>
      <div><span>${en ? "Transfer installments payable" : "转会分期应付"}</span><strong class="${budget.obligations.scheduledPayable > 0 ? "stat-low" : "stat-high"}">${formatMoney(budget.obligations.scheduledPayable)}</strong></div>
      <div><span>${en ? "Transfer installments receivable" : "转会分期应收"}</span><strong class="${budget.obligations.scheduledReceivable > 0 ? "stat-high" : "muted"}">${formatMoney(budget.obligations.scheduledReceivable)}</strong></div>
      <div><span>${en ? "Conditional transfer exposure" : "条件转会付款风险"}</span><strong class="${budget.obligations.conditionalPayable > 0 ? "stat-low" : "stat-high"}">${formatMoney(budget.obligations.conditionalPayable)}</strong></div>
      <div><span>${en ? "Safe transfer ceiling" : "安全转会上限"}</span><strong>${formatMoney(budget.safeTransferCeiling)}</strong></div>
      <div><span>${en ? "Planned transfer budget" : "计划转会预算"}</span><strong class="stat-high">${formatMoney(budget.plannedTransferBudget)}</strong></div>
      <div><span>${en ? "Projected season-end cash" : "预计季末余额"}</span><strong class="${budget.projectedEndAfterBudget >= 0 ? "stat-high" : "stat-low"}">${formatMoney(budget.projectedEndAfterBudget)}</strong></div>
      <div><span>${en ? "Remaining home gates" : "剩余联赛主场"}</span><strong>${budget.remainingHomeMatches} · ${formatMoney(budget.projectedTickets)}</strong></div>
      <div><span>${en ? "Projected wage ratio" : "预计工资占比"}</span><strong class="${budget.wageShare <= 70 ? "stat-high" : budget.wageShare <= 90 ? "stat-mid" : "stat-low"}">${wageShare}</strong></div>`;
  }

  const totals = new Map();
  for (const entry of ledger.entries) {
    const category = entry.category || "other";
    if (!totals.has(category)) totals.set(category, { income: 0, expense: 0, net: 0 });
    const row = totals.get(category);
    const amount = Number(entry.amount) || 0;
    if (amount >= 0) row.income += amount;
    else row.expense += -amount;
    row.net += amount;
  }
  const categories = [
    ...FINANCE_CATEGORY_ORDER.filter((category) => totals.has(category)),
    ...[...totals.keys()].filter((category) => !FINANCE_CATEGORY_ORDER.includes(category)).sort(),
  ];
  const breakdownBody = $("#finance-breakdown-table tbody");
  if (breakdownBody) {
    breakdownBody.innerHTML = categories.length
      ? categories.map((category) => {
          const row = totals.get(category);
          return `<tr>
            <td>${financeCategoryBadge(category, en)}</td>
            <td class="stat-high">${row.income ? formatMoney(row.income) : "—"}</td>
            <td class="stat-low">${row.expense ? formatMoney(row.expense) : "—"}</td>
            <td class="${row.net >= 0 ? "stat-high" : "stat-low"}">${formatMoney(row.net)}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="4" class="muted">${en ? "No season transactions" : "本赛季暂无流水"}</td></tr>`;
  }
  const countEl = $("#finance-entry-count");
  if (countEl) countEl.textContent = en ? `${ledger.entries.length} entries` : `${ledger.entries.length} 笔`;

  let activeFilter = ledgerFilter;
  const filter = $("#finance-category-filter");
  if (filter) {
    const filterCategories = categories.length ? categories : FINANCE_CATEGORY_ORDER;
    filter.innerHTML = `<option value="all">${en ? "All categories" : "全部分类"}</option>${filterCategories
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(financeCategoryLabel(category, en))}</option>`)
      .join("")}`;
    if (activeFilter !== "all" && !filterCategories.includes(activeFilter)) {
      activeFilter = "all";
      onFilterReset?.(activeFilter);
    }
    filter.value = activeFilter;
  }

  const visibleEntries = ledger.entries
    .filter((entry) => activeFilter === "all" || entry.category === activeFilter)
    .slice()
    .reverse()
    .slice(0, 120);
  const ledgerBody = $("#finance-ledger-table tbody");
  if (ledgerBody) {
    ledgerBody.innerHTML = visibleEntries.length
      ? visibleEntries.map((entry) => {
          const amount = Number(entry.amount) || 0;
          const date = entry.day === 0
            ? (en ? "Opening" : "期初")
            : `${entry.season != null ? `S${entry.season} · ` : ""}D${entry.day ?? "—"}`;
          return `<tr>
            <td class="muted">${escapeHtml(date)}</td>
            <td>${financeCategoryBadge(entry.category || "other", en)}</td>
            <td>${escapeHtml(financeSourceLabel(entry.source, en))}</td>
            <td class="stat-high">${amount > 0 ? formatMoney(amount) : "—"}</td>
            <td class="stat-low">${amount < 0 ? formatMoney(-amount) : "—"}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="5" class="muted">${en ? "No matching transactions" : "没有符合筛选条件的流水"}</td></tr>`;
  }
}

export function renderSponsorship(world, club, en) {
  const box = $("#finance-sponsorship");
  const status = $("#finance-sponsorship-status");
  if (!box || !world || !club) return;
  const data = sponsorshipSnapshot(world, club);
  const active = data.active;
  const next = data.next;
  if (status) {
    status.textContent = next
      ? (en ? `Next season: ${next.sponsor}` : `下赛季：${next.sponsor}`)
      : (en ? `Renews after S${active.endSeason}` : `${active.endSeason} 赛季后续签`);
  }
  const offerCards = (data.offers || []).map((offer) => {
    const selected = next?.id === offer.id;
    const target = Math.max(1, Math.ceil(18 * offer.targetRate));
    return `<div class="sponsor-offer">
      <strong>${escapeHtml(offer.sponsor)}</strong>
      <span>${offer.years}${en ? "y" : "年"} · ${en ? "weekly" : "周收入"} ${formatMoney(offer.weeklyBase)}</span>
      <span>${en ? "top" : "排名前"} ${target} · ${en ? "bonus" : "达标奖"} ${formatMoney(offer.performanceBonus)}</span>
      <button type="button" class="btn small ${selected ? "primary" : ""}" data-sponsor-offer="${escapeHtml(offer.id)}">${selected ? (en ? "Selected" : "已选定") : (en ? "Select" : "选择")}</button>
    </div>`;
  }).join("");
  box.innerHTML = `
    <div><span>${en ? "Current sponsor" : "当前赞助商"}</span><strong>${escapeHtml(active.sponsor)}</strong></div>
    <div><span>${en ? "Contract" : "合同期"}</span><strong>S${active.startSeason}–S${active.endSeason}</strong></div>
    <div><span>${en ? "Sponsor weekly" : "赞助周收入"}</span><strong>${formatMoney(active.weeklyBase)}</strong></div>
    <div><span>${en ? "Target / bonus" : "目标 / 达标奖"}</span><strong>${en ? `Top ${data.targetPosition}` : `前 ${data.targetPosition}`} · ${formatMoney(active.performanceBonus)}</strong></div>
    <div class="sponsor-offers"><span>${en ? "Offers for next season" : "下赛季报价"}</span><div class="sponsor-offer-list">${offerCards}</div></div>`;
}

export function renderDebtFinance(club, budget, en) {
  const box = $("#finance-debt");
  if (!box || !club || !budget?.debt) return;
  const debt = budget.debt;
  const compliance = budget.compliance || {};
  const complianceLabels = {
    compliant: en ? "Compliant" : "合规",
    warning: en ? "Warning" : "预警",
    restricted: en ? "Transfer restricted" : "转会受限",
  };
  const facilities = debt.facilities.length
    ? debt.facilities.map((facility) => `<div class="debt-facility">
        <strong>${escapeHtml(facility.lender || (facility.kind === "owner" ? "Club ownership" : "Lender"))}</strong>
        <span>${en ? "principal" : "本金"} ${formatMoney(facility.balance)} · ${en ? "rate" : "年利率"} ${(Number(facility.annualRate || 0) * 100).toFixed(1)}% · ${en ? "maturity" : "到期"} S${facility.maturitySeason}</span>
        <button type="button" class="btn small" data-debt-repay="${escapeHtml(facility.id)}">${en ? "Repay" : "提前还款"}</button>
      </div>`).join("")
    : `<span>${en ? "No outstanding financing" : "当前无未偿融资"}</span>`;
  box.innerHTML = `
    <div><span>${en ? "Outstanding debt" : "未偿债务"}</span><strong>${formatMoney(debt.outstanding)}</strong></div>
    <div><span>${en ? "Weekly interest" : "每周利息"}</span><strong>${formatMoney(debt.weeklyInterest)}</strong></div>
    <div><span>${en ? "Principal due this season" : "本季到期本金"}</span><strong>${formatMoney(debt.principalDueThisSeason)}</strong></div>
    <div><span>${en ? "Borrowing headroom" : "可用融资额度"}</span><strong>${formatMoney(debt.headroom)}</strong></div>
    <div><span>${en ? "Compliance" : "财政合规"}</span><strong class="${compliance.status === "restricted" ? "stat-low" : compliance.status === "warning" ? "stat-mid" : "stat-high"}">${complianceLabels[compliance.status] || complianceLabels.compliant}</strong><span>${en ? "wages" : "工资"} ${compliance.wageRatio || 0}% · ${en ? "debt/revenue" : "债务/收入"} ${compliance.debtRatio || 0}%</span></div>
    <div class="debt-facilities"><span>${en ? "Facilities" : "融资明细"}</span><div class="debt-facility-list">${facilities}</div></div>`;
}
