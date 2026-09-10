import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { getDb } from "./index.ts";
import { ingestionRuns, jurisdictions, orders, sourceChecks, sourceSnapshots, sources } from "./schema.ts";
import type { HalfMastOrder, Jurisdiction, SourceSnapshot } from "../lib/types.ts";

type Database = ReturnType<typeof getDb>;

const asDate = (value: string | undefined | null) => value ? new Date(value) : undefined;
const asIso = (value: Date | string | null | undefined) => value == null ? undefined : value instanceof Date ? value.toISOString() : value;

function mapOrder(row: { orders: typeof orders.$inferSelect; jurisdictions: typeof jurisdictions.$inferSelect }): HalfMastOrder {
  const jurisdiction: Jurisdiction = {
    id: row.jurisdictions.id,
    name: row.jurisdictions.name,
    stateCode: row.jurisdictions.stateCode || undefined,
    level: row.jurisdictions.level,
  };
  return {
    ...row.orders,
    jurisdiction,
    flagTypes: row.orders.flagTypes as HalfMastOrder["flagTypes"],
    scope: row.orders.scope as HalfMastOrder["scope"],
    instructionType: row.orders.instructionType as HalfMastOrder["instructionType"],
    status: row.orders.status,
    createdAt: asIso(row.orders.createdAt)!,
    effectiveEndTime: row.orders.effectiveEndTime || undefined,
    effectiveEndCondition: row.orders.effectiveEndCondition as HalfMastOrder["effectiveEndCondition"],
    timeZone: row.orders.timeZone as HalfMastOrder["timeZone"],
  };
}

export async function listActiveOrders(db: Database, date: string) {
  const rows = await db.select().from(orders)
    .innerJoin(jurisdictions, eq(orders.jurisdictionId, jurisdictions.id))
    .where(and(eq(orders.status, "published"), lte(orders.effectiveStart, date), or(isNull(orders.effectiveEnd), gte(orders.effectiveEnd, date))));
  return rows.map(mapOrder);
}

export async function upsertJurisdiction(db: Database, jurisdiction: Jurisdiction) {
  await db.insert(jurisdictions).values({
    id: jurisdiction.id,
    name: jurisdiction.name,
    stateCode: jurisdiction.stateCode,
    level: jurisdiction.level,
  }).onConflictDoUpdate({ target: jurisdictions.id, set: { name: jurisdiction.name, stateCode: jurisdiction.stateCode, level: jurisdiction.level } });
}

export async function upsertSource(db: Database, source: { id: string; jurisdictionId?: string; name: string; url: string; sourceType: string; parserName?: string; priority?: "primary" | "secondary" | "fallback"; timeZone?: string; pollIntervalMinutes?: number }) {
  const values = { id: source.id, jurisdictionId: source.jurisdictionId, name: source.name, url: source.url, sourceType: source.sourceType, parserName: source.parserName || "unknown", priority: source.priority || "primary", timeZone: source.timeZone || "America/New_York", pollIntervalMinutes: source.pollIntervalMinutes || 30 };
  await db.insert(sources).values(values)
    .onConflictDoUpdate({ target: sources.id, set: { name: source.name, url: source.url, sourceType: source.sourceType, jurisdictionId: source.jurisdictionId, parserName: values.parserName, priority: values.priority, timeZone: values.timeZone, pollIntervalMinutes: values.pollIntervalMinutes } });
}

export async function startIngestionRun(db: Database, id: string, sourceId: string, startedAt = new Date()) {
  await db.insert(ingestionRuns).values({ id, sourceId, startedAt, status: "running" }).onConflictDoNothing({ target: ingestionRuns.id });
}

export async function finishIngestionRun(db: Database, id: string, status: "completed" | "failed", recordsFound: number, error?: string) {
  await db.update(ingestionRuns).set({ completedAt: new Date(), status, recordsFound, error }).where(eq(ingestionRuns.id, id));
}

export async function recordSourceCheck(db: Database, values: { id: string; sourceId: string; ingestionRunId: string; status: "changed" | "unchanged" | "failed"; contentHash?: string; httpStatus?: number; responseLatencyMs?: number; etag?: string; lastModified?: string; error?: string }) {
  await db.insert(sourceChecks).values({ ...values, checkedAt: new Date() }).onConflictDoNothing({ target: sourceChecks.id });
}

export async function getSource(db: Database, id: string) {
  return (await db.select().from(sources).where(eq(sources.id, id)))[0];
}

export async function updateSourceHealth(db: Database, id: string, values: { checkedAt: Date; successful: boolean; latencyMs: number; etag?: string; lastModified?: string }) {
  const source = await getSource(db, id);
  await db.update(sources).set({
    lastCheckedAt: values.checkedAt,
    lastSuccessfulAt: values.successful ? values.checkedAt : source?.lastSuccessfulAt,
    consecutiveFailures: values.successful ? 0 : (source?.consecutiveFailures || 0) + 1,
    lastLatencyMs: values.latencyMs,
    etag: values.etag || source?.etag,
    lastModified: values.lastModified || source?.lastModified,
  }).where(eq(sources.id, id));
}

export async function upsertSourceSnapshot(db: Database, snapshot: SourceSnapshot) {
  await db.insert(sourceSnapshots).values({
    id: snapshot.id,
    sourceId: snapshot.sourceId,
    url: snapshot.url,
    retrievedAt: asDate(snapshot.retrievedAt)!,
    contentHash: snapshot.contentHash,
    content: snapshot.content,
    parserStatus: snapshot.parserStatus,
  }).onConflictDoNothing({ target: sourceSnapshots.id });
}

export async function upsertOrder(db: Database, order: HalfMastOrder) {
  await db.insert(orders).values({
    id: order.id, title: order.title, reason: order.reason, issuingAuthority: order.issuingAuthority,
    jurisdictionId: order.jurisdiction.id, flagTypes: order.flagTypes, scope: order.scope,
    instructionType: order.instructionType, instructionText: order.instructionText,
    effectiveStart: order.effectiveStart, effectiveEnd: order.effectiveEnd, effectiveEndTime: order.effectiveEndTime,
    effectiveEndCondition: order.effectiveEndCondition, timeZone: order.timeZone, sourceUrl: order.sourceUrl,
    sourceSnapshotId: order.sourceSnapshotId, status: order.status, createdAt: asDate(order.createdAt)!,
  }).onConflictDoUpdate({ target: orders.id, set: {
    title: order.title, reason: order.reason, instructionType: order.instructionType, instructionText: order.instructionText,
    effectiveStart: order.effectiveStart, effectiveEnd: order.effectiveEnd, effectiveEndTime: order.effectiveEndTime,
    effectiveEndCondition: order.effectiveEndCondition, timeZone: order.timeZone, sourceSnapshotId: order.sourceSnapshotId, status: order.status,
    updatedAt: new Date(),
  }});
}
