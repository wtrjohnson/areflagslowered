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
const ARE_FLAGS_LOWERED_URL = process.env.ARE_FLAGS_LOWERED_URL || "https://are-flags-lowered.kvex.chatgpt.site";

function truncate(value: string, maxLength: number) {
  const characters = Array.from(value.trim());
  return characters.length <= maxLength ? characters.join("") : `${characters.slice(0, Math.max(0, maxLength - 1)).join("").trimEnd()}…`;
}

function calendarDate(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function monthAndDay(date: Date) {
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(date),
    day: new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(date),
  };
}

function formatXDates(start: string, end?: string) {
  const first = monthAndDay(calendarDate(start));
  if (!end) return `${first.month}, ${first.day}`;
  const last = monthAndDay(calendarDate(end));
  return first.month === last.month
    ? `${first.month}, ${first.day}–${last.day}`
    : `${first.month}, ${first.day}–${last.month}, ${last.day}`;
}

/**
 * Creates the immutable, public copy for one source email.  The source snapshot
 * is part of the ID so a correction becomes a distinct post while retries of the
 * same inbound email remain idempotent.
 */
export function createXPostDraft(order: HalfMastOrder, createdAt = new Date().toISOString()): SocialDraft {
  const isCorrection = order.alertType === "correction" || order.alertType === "revision";
  const intro = isCorrection
    ? `CORRECTION to ${order.jurisdiction.name} half-mast order:`
    : `${order.jurisdiction.name} half-mast order:`;
  const dates = isCorrection ? undefined : formatXDates(order.effectiveStart, order.effectiveEnd);
  const fixedText = [intro, dates, "", ARE_FLAGS_LOWERED_URL].filter((value) => value !== undefined).join("\n");
  const availableForBody = Math.max(0, X_POST_MAX_LENGTH - Array.from(fixedText).length - 1);
  const reason = truncate(order.reason, availableForBody);
  return {
    id: `x-${order.id}-${order.sourceSnapshotId}`,
    orderId: order.id,
    status: "draft",
    createdAt,
    text: isCorrection
      ? `${intro} ${reason}\n\n${ARE_FLAGS_LOWERED_URL}`
      : `${intro} ${reason}\n${dates}\n\n${ARE_FLAGS_LOWERED_URL}`,
  };
}
