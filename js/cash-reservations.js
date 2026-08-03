/** Cash reserved by active transfer, renewal, and loan negotiations. */

import { buildTransferPaymentPlan } from "./finance-obligations.js";

export const ACTIVE_TRANSFER_NEGOTIATION_STATUSES = new Set([
  "market_search",
  "seller_review",
  "buyer_review",
  "club_review",
  "club_counter",
  "player_review",
  "player_counter",
]);

export const ACTIVE_DEAL_NEGOTIATION_STATUSES = new Set([
  "party_review",
  "party_counter",
  "club_review",
  "club_counter",
  "market_search",
  "offer_review",
  "buyer_review",
  "player_review",
]);

function nonNegativeMoney(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function transferNegotiationCashCost(negotiation) {
  const years = Math.max(1, Math.min(5, Math.round(Number(negotiation?.years) || 3)));
  const wage = nonNegativeMoney(negotiation?.wage);
  const plan = buildTransferPaymentPlan(
    negotiation?.fee,
    negotiation?.upfrontPct,
    negotiation?.installmentCount
  );
  return plan.upfront + Math.round(wage * years * 0.5);
}

export function activeTransferCashCommitments(world, buyerClubId, { excludeId = null } = {}) {
  return (Array.isArray(world?.transferNegotiations) ? world.transferNegotiations : [])
    .filter(
      (negotiation) =>
        ACTIVE_TRANSFER_NEGOTIATION_STATUSES.has(negotiation?.status) &&
        negotiation.buyerClubId === buyerClubId &&
        negotiation.id !== excludeId
    )
    .reduce((sum, negotiation) => sum + transferNegotiationCashCost(negotiation), 0);
}

export function dealNegotiationCashCost(negotiation) {
  if (!negotiation) return 0;
  if (negotiation.kind === "renewal") return nonNegativeMoney(negotiation.signingBonus);
  if (negotiation.kind === "loan_in" || negotiation.kind === "loan_out") {
    return nonNegativeMoney(negotiation.fee);
  }
  return 0;
}

export function activeDealCashCommitments(world, payerClubId, { excludeId = null } = {}) {
  return (Array.isArray(world?.dealNegotiations) ? world.dealNegotiations : [])
    .filter(
      (negotiation) =>
        ACTIVE_DEAL_NEGOTIATION_STATUSES.has(negotiation?.status) &&
        negotiation.payerClubId === payerClubId &&
        negotiation.id !== excludeId
    )
    .reduce((sum, negotiation) => sum + dealNegotiationCashCost(negotiation), 0);
}

export function hasActiveDealNegotiation(world, playerId) {
  return (Array.isArray(world?.dealNegotiations) ? world.dealNegotiations : []).some(
    (negotiation) =>
      negotiation.playerId === playerId &&
      ACTIVE_DEAL_NEGOTIATION_STATUSES.has(negotiation.status)
  );
}

export function clubCashAvailability(
  world,
  club,
  required,
  { excludeTransferId = null, excludeDealId = null } = {}
) {
  const cash = Number(club?.money) || 0;
  const transferReserved = activeTransferCashCommitments(world, club?.id, { excludeId: excludeTransferId });
  const dealReserved = activeDealCashCommitments(world, club?.id, { excludeId: excludeDealId });
  const reserved = transferReserved + dealReserved;
  const available = Math.max(0, cash - reserved);
  const cost = nonNegativeMoney(required);
  return {
    ok: available >= cost,
    cash,
    reserved,
    transferReserved,
    dealReserved,
    available,
    required: cost,
    shortfall: Math.max(0, cost - available),
  };
}
