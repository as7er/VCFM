/** Cash reserved by active user transfer negotiations. */

export const ACTIVE_TRANSFER_NEGOTIATION_STATUSES = new Set([
  "club_review",
  "club_counter",
  "player_review",
  "player_counter",
]);

function nonNegativeMoney(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function transferNegotiationCashCost(negotiation) {
  const years = Math.max(1, Math.min(5, Math.round(Number(negotiation?.years) || 3)));
  const wage = nonNegativeMoney(negotiation?.wage);
  return nonNegativeMoney(negotiation?.fee) + Math.round(wage * years * 0.5);
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

export function clubCashAvailability(world, club, required, { excludeTransferId = null } = {}) {
  const cash = Number(club?.money) || 0;
  const reserved = activeTransferCashCommitments(world, club?.id, { excludeId: excludeTransferId });
  const available = Math.max(0, cash - reserved);
  const cost = nonNegativeMoney(required);
  return {
    ok: available >= cost,
    cash,
    reserved,
    available,
    required: cost,
    shortfall: Math.max(0, cost - available),
  };
}
