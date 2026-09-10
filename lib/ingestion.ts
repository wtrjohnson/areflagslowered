import type { HalfMastOrder, SourceSnapshot } from "./types.ts";

export type IngestionResult = {
  snapshot: SourceSnapshot;
  order?: HalfMastOrder;
  needsReview: boolean;
  reason?: string;
};

export function normalizeSourceChange({
  snapshot,
  parsedOrder,
}: {
  snapshot: SourceSnapshot;
  parsedOrder?: HalfMastOrder;
}): IngestionResult {
  if (snapshot.parserStatus === "failed") {
    return { snapshot, needsReview: true, reason: "The source could not be parsed." };
  }
  if (!parsedOrder) {
    return { snapshot, needsReview: true, reason: "A source changed but no order was confidently extracted." };
  }
  return {
    snapshot,
    order: { ...parsedOrder, sourceSnapshotId: snapshot.id },
    needsReview: parsedOrder.status === "needs_review",
    reason: parsedOrder.status === "needs_review" ? "The order requires human review." : undefined,
  };
}

export { discoverWhiteHouseLinks, fetchWhiteHouseDocument, isHalfStaffCandidate, parseWhiteHouseProclamation, WHITE_HOUSE_SEARCH_URL } from "./sources/white-house.ts";
export { parseTexasFlagStatus, TEXAS_FLAG_STATUS_URL } from "./sources/texas.ts";
export { parseStateStatusPage, stateStatusPatterns } from "./sources/state-status.ts";
