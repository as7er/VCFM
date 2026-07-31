import assert from "node:assert/strict";

import {
  ensureFinanceLedger,
  financeLedgerSummary,
  recordFinanceEntry,
} from "../js/finance-ledger.js";

const legacy = {
  id: "legacy-club",
  money: 1_000_000,
  finance: {
    seasonTicketIncome: 120_000,
    seasonCommercialIncome: 80_000,
    seasonWageOut: 70_000,
    seasonFacilityOut: 30_000,
    seasonTransferNet: -15_000,
    seasonBroadcastIncome: 50_000,
    seasonPrizeIncome: 10_000,
  },
};
const before = legacy.money;
const migrated = ensureFinanceLedger(legacy, legacy.finance, 2026);
assert.equal(legacy.money, before, "migration must not change cash");
assert.equal(migrated.length, 7, "legacy totals should migrate into ledger entries");
assert.equal(legacy.finance.ledgerVersion, 1);

recordFinanceEntry(legacy, 25_000, { category: "ticket", season: 2026, day: 12, source: "audit" });
recordFinanceEntry(legacy, -8_000, { category: "wage", season: 2026, day: 12, source: "audit" });
assert.equal(legacy.money, before + 17_000, "entries must update club cash exactly once");
const summary = financeLedgerSummary(legacy, 2026);
assert.equal(summary.byCategory.ticket, 145_000);
assert.equal(summary.byCategory.wage, -78_000);
assert.equal(summary.net, 162_000);

const fresh = { id: "fresh-club", money: 500_000, finance: {} };
ensureFinanceLedger(fresh, fresh.finance);
assert.equal(fresh.finance.ledgerSeason, null, "missing season must stay null instead of becoming season zero");
recordFinanceEntry(fresh, -125_000, { category: "facility", season: 2027, day: 1 });
assert.equal(fresh.money, 375_000);
assert.equal(fresh.finance.seasonFacilityOut, 125_000);
assert.equal(financeLedgerSummary(fresh, 2027).net, -125_000);

console.log("Finance ledger audit passed: migration, signed entries, balance updates, and summaries");
