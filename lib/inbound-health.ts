import { and, desc, eq, gte } from "drizzle-orm";
import { inboundEmails, orders, sourceSnapshots, sources } from "../db/schema.ts";
import type { getDb } from "../db/index.ts";

const AFE_SOURCE_ID = "american-flags-express-email";

type Database = ReturnType<typeof getDb>;

export async function inboundHealth(db: Database, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [recent, latest, indefinite] = await Promise.all([
    db.select().from(inboundEmails).where(gte(inboundEmails.receivedAt, since)),
    db.select().from(inboundEmails).orderBy(desc(inboundEmails.receivedAt)).limit(25),
    db.select({ order: orders }).from(orders)
      .innerJoin(sourceSnapshots, eq(orders.sourceSnapshotId, sourceSnapshots.id))
      .innerJoin(sources, eq(sourceSnapshots.sourceId, sources.id))
      .where(and(eq(orders.status, "published"), eq(sources.id, AFE_SOURCE_ID))),
  ]);
  const counts = recent.reduce<Record<string, number>>((result, row) => {
    result[row.processingStatus] = (result[row.processingStatus] || 0) + 1;
    return result;
  }, {});
  const longRunning = indefinite.map((row) => row.order)
    .filter((order) => !order.effectiveEnd && order.effectiveStart < now.toISOString().slice(0, 10));
  return {
    checkedAt: now.toISOString(),
    last24Hours: counts,
    latestSuccessfulInboundAt: latest.find((row) => ["published", "updated", "cancelled", "local_only"].includes(row.processingStatus))?.receivedAt.toISOString() || null,
    quarantined: recent.filter((row) => row.processingStatus === "quarantined").map((row) => ({ id: row.id, subject: row.subject, receivedAt: row.receivedAt.toISOString(), error: row.error })),
    longRunning: longRunning.map((order) => ({ id: order.id, title: order.title, effectiveStart: order.effectiveStart, jurisdictionId: order.jurisdictionId })),
  };
}

export function formatInboundHealth(summary: Awaited<ReturnType<typeof inboundHealth>>) {
  const counts = Object.entries(summary.last24Hours).map(([status, count]) => `${status}: ${count}`).join("\n") || "No inbound messages in the last 24 hours.";
  const longRunning = summary.longRunning.length ? summary.longRunning.map((order) => `${order.title} (${order.jurisdictionId}, active since ${order.effectiveStart})`).join("\n") : "None";
  return [
    "American Flags Express daily health summary",
    "",
    `Generated: ${summary.checkedAt}`,
    `Latest successful inbound: ${summary.latestSuccessfulInboundAt || "none recorded"}`,
    "",
    "Last 24 hours",
    counts,
    "",
    `Quarantined messages: ${summary.quarantined.length}`,
    "Active orders with no end date",
    longRunning,
  ].join("\n");
}
