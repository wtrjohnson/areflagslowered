import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import type { getDb } from "../db/index.ts";
import { currentStatus, inboundEmails, inboundReviewEvents, jurisdictions, orders, sourceSnapshots, sources } from "../db/schema.ts";
import { inboundHealth } from "./inbound-health.ts";
import { xPublishingStatus } from "./x-publishing.ts";
import { emailText, parseInboundEmail } from "./afe-email.ts";

type Database = ReturnType<typeof getDb>;
const AFE_SOURCE_ID = "american-flags-express-email";

const iso = (value: Date | null) => value?.toISOString() || null;

export async function adminDashboardData(db: Database, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const [queue, active, health, xDelivery, candidateRows, mastRows, auditRows] = await Promise.all([
    db.select().from(inboundEmails).where(eq(inboundEmails.processingStatus, "quarantined")).orderBy(desc(inboundEmails.receivedAt)),
    db.select({ order: orders, jurisdiction: jurisdictions }).from(orders)
      .innerJoin(jurisdictions, eq(orders.jurisdictionId, jurisdictions.id))
      .where(and(
        eq(orders.status, "published"),
        inArray(orders.geographicScope, ["nationwide", "statewide"]),
        lte(orders.effectiveStart, today),
        or(isNull(orders.effectiveEnd), gte(orders.effectiveEnd, today)),
      )),
    inboundHealth(db, now),
    xPublishingStatus(db),
    db.select({ order: orders, jurisdiction: jurisdictions }).from(orders)
      .innerJoin(jurisdictions, eq(orders.jurisdictionId, jurisdictions.id))
      .innerJoin(sourceSnapshots, eq(orders.sourceSnapshotId, sourceSnapshots.id))
      .innerJoin(sources, eq(sourceSnapshots.sourceId, sources.id))
      .where(and(eq(orders.status, "published"), eq(sources.id, AFE_SOURCE_ID)))
      .orderBy(desc(orders.updatedAt)),
    db.select().from(currentStatus),
    db.select().from(inboundReviewEvents).orderBy(desc(inboundReviewEvents.createdAt)).limit(200),
  ]);
  const mastByJurisdiction = new Map<string, Record<string, string>>();
  for (const row of mastRows) {
    const statuses = mastByJurisdiction.get(row.jurisdictionId) || {};
    statuses[row.flagType] = row.status;
    mastByJurisdiction.set(row.jurisdictionId, statuses);
  }
  const auditsByInbound = new Map<string, typeof auditRows>();
  for (const event of auditRows) {
    const events = auditsByInbound.get(event.inboundEmailId) || [];
    events.push(event);
    auditsByInbound.set(event.inboundEmailId, events);
  }
  return {
    generatedAt: now.toISOString(),
    queue: queue.map((row) => ({
      ...row,
      normalizedEmail: emailText(parseInboundEmail(row.rawEmail)),
      receivedAt: row.receivedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      events: (auditsByInbound.get(row.id) || []).map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    })),
    activeOrders: active.map(({ order, jurisdiction }) => ({
      ...order,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      jurisdiction,
      mastStatus: mastByJurisdiction.get(jurisdiction.id) || {},
    })),
    health,
    xDelivery: {
      ...xDelivery,
      drafts: xDelivery.drafts.map((draft) => ({
        ...draft,
        createdAt: draft.createdAt.toISOString(),
        publishedAt: iso(draft.publishedAt),
        lastAttemptAt: iso(draft.lastAttemptAt),
        retryAvailable: draft.status !== "published",
      })),
    },
    matchingOrders: candidateRows.map(({ order, jurisdiction }) => ({
      id: order.id,
      title: order.title,
      reason: order.reason,
      jurisdictionId: order.jurisdictionId,
      jurisdictionName: jurisdiction.name,
      scope: order.scope,
      flagTypes: order.flagTypes,
      effectiveStart: order.effectiveStart,
      effectiveEnd: order.effectiveEnd,
      issuingAuthority: order.issuingAuthority,
      updatedAt: order.updatedAt.toISOString(),
    })),
  };
}

export type AdminDashboardData = Awaited<ReturnType<typeof adminDashboardData>>;
