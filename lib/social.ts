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

const X_POST_MAX_LENGTH = 280;

function truncate(value: string, maxLength: number) {
  const characters = Array.from(value.trim());
  return characters.length <= maxLength ? characters.join("") : `${characters.slice(0, Math.max(0, maxLength - 1)).join("").trimEnd()}…`;
}

/**
 * Creates the immutable, public copy for one source email.  The source snapshot
 * is part of the ID so a correction becomes a distinct post while retries of the
 * same inbound email remain idempotent.
 */
export function createXPostDraft(order: HalfMastOrder, createdAt = new Date().toISOString()): SocialDraft {
  const isCorrection = order.alertType === "correction" || order.alertType === "revision";
  const action = isCorrection ? "Correction" : "New half-mast order";
  const dates = order.effectiveEnd
    ? `${order.effectiveStart}–${order.effectiveEnd}`
    : `starting ${order.effectiveStart}`;
  const source = `Source: ${order.sourceUrl}`;
  const intro = `${action}: ${order.jurisdiction.name}, ${dates}.`;
  const availableForBody = Math.max(0, X_POST_MAX_LENGTH - Array.from(`${intro}\n${source}`).length - 1);
  const reason = truncate(order.reason, availableForBody);
  return {
    id: `x-${order.id}-${order.sourceSnapshotId}`,
    orderId: order.id,
    status: "draft",
    createdAt,
    text: [intro, reason, source].filter(Boolean).join("\n"),
  };
}
