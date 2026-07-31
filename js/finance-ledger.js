/** Append-only cash ledger shared by every club. Amounts are signed. */

export const FINANCE_LEDGER_VERSION = 1;
const LEGACY_FIELDS = Object.freeze({
  ticket: "seasonTicketIncome",
  commercial: "seasonCommercialIncome",
  wage: "seasonWageOut",
  facility: "seasonFacilityOut",
  transfer: "seasonTransferNet",
  broadcast: "seasonBroadcastIncome",
  prize: "seasonPrizeIncome",
});

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function ensureLedger(finance) {
  if (!Array.isArray(finance.financeLedger)) finance.financeLedger = [];
  return finance.financeLedger;
}

/** Migrate pre-ledger season totals once without changing the visible balance. */
export function ensureFinanceLedger(club, finance, season = null) {
  if (!club || !finance) return [];
  const ledger = ensureLedger(finance);
  const hasSeason = season != null && Number.isFinite(Number(season));
  if (finance.ledgerVersion === FINANCE_LEDGER_VERSION) {
    finance.ledgerSeq = Math.max(numeric(finance.ledgerSeq), ledger.length);
    if (hasSeason) finance.ledgerSeason = Number(season);
    return ledger;
  }
  const legacySeason = finance.ledgerSeason ?? (hasSeason ? Number(season) : null);
  for (const [category, field] of Object.entries(LEGACY_FIELDS)) {
    const value = numeric(finance[field]);
    if (!value) continue;
    ledger.push({
      id: `legacy_${category}_${ledger.length}`,
      season: legacySeason,
      day: 0,
      category,
      amount: category === "wage" || category === "facility" ? -Math.abs(value) : value,
      source: "legacy",
    });
  }
  finance.ledgerVersion = FINANCE_LEDGER_VERSION;
  finance.ledgerSeason = legacySeason;
  finance.ledgerSeq = ledger.length;
  return ledger;
}

export function recordFinanceEntry(club, amount, details = {}) {
  if (!club) return null;
  if (!club.finance || typeof club.finance !== "object") club.finance = {};
  const finance = club.finance;
  const ledger = ensureFinanceLedger(club, finance, details.season);
  const value = Math.round(numeric(amount));
  if (!value) return null;
  club.money = numeric(club.money) + value;
  const category = details.category || "other";
  finance.ledgerSeq = numeric(finance.ledgerSeq) + 1;
  const entry = {
    id: details.id || `f_${finance.ledgerSeq}`,
    season: details.season ?? finance.ledgerSeason ?? null,
    day: details.day ?? null,
    category,
    amount: value,
    source: details.source || "system",
    ...(details.meta ? { meta: details.meta } : {}),
  };
  ledger.push(entry);
  if (ledger.length > 240) ledger.splice(0, ledger.length - 240);

  const field = LEGACY_FIELDS[category];
  if (field) {
    // Preserve the established season counters for old UI and save compatibility.
    finance[field] = numeric(finance[field]) + (category === "wage" || category === "facility" ? -value : value);
  }
  return entry;
}

export function financeLedgerSummary(club, season = null) {
  const ledger = ensureFinanceLedger(club, club?.finance, season);
  const byCategory = {};
  const entries = [];
  let net = 0;
  for (const entry of ledger) {
    if (season != null && Number(entry.season) !== Number(season)) continue;
    const amount = numeric(entry.amount);
    net += amount;
    byCategory[entry.category] = (byCategory[entry.category] || 0) + amount;
    entries.push(entry);
  }
  return { net, byCategory, entries };
}

export function resetFinanceLedgerSeason(club, season) {
  const finance = club?.finance;
  if (!finance) return;
  ensureFinanceLedger(club, finance, season);
  finance.ledgerSeason = season;
  for (const field of Object.values(LEGACY_FIELDS)) finance[field] = 0;
}
