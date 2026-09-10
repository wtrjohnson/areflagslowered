import type { HalfMastOrder, SocialDraft } from "./types.ts";

export function createSocialDraft(order: HalfMastOrder, createdAt = new Date().toISOString()): SocialDraft {
  const dates = order.effectiveEnd
    ? `${order.effectiveStart} through ${order.effectiveEnd}`
    : `starting ${order.effectiveStart}`;
  return {
    id: `draft-${order.id}`,
    orderId: order.id,
    status: "draft",
    createdAt,
    text: `Flags are at half-mast ${dates} in ${order.jurisdiction.name}. ${order.reason} Official source: ${order.sourceUrl}`,
  };
}
