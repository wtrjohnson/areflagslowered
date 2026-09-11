import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "./index.ts";
import { currentStatus, jurisdictions, manualOverrides, statusHistory } from "./schema.ts";
import { listActiveOrders } from "./orders.ts";
import { allJurisdictions } from "../lib/jurisdictions.ts";
import { monitoredSources } from "../lib/source-registry.ts";
import { stateStatusPatterns } from "../lib/sources/state-status.ts";
import type { FlagType, HalfMastOrder } from "../lib/types.ts";
import type { ParsedJurisdictionStatus } from "../lib/sources/texas.ts";

type Database = ReturnType<typeof getDb>;
type StatusValue = "half_mast" | "full_mast" | "below_us" | "uncertain";

const coverageNotice = "Coverage currently includes official U.S. federal and state/territorial orders. City, county, facility, institutional, and private-flag orders may differ.";

function appliesToJurisdiction(order: HalfMastOrder, jurisdictionId: string) {
  return order.scope === "nationwide" || order.jurisdiction.id === jurisdictionId;
}

function sourceFor(orders: HalfMastOrder[]) {
  return orders[0]?.sourceUrl;
}

export async function refreshCurrentStatuses(db: Database, date: string, checkedAt = new Date()) {
  const activeOrders = await listActiveOrders(db, date);
  const federalOrder = activeOrders.find((order) => order.jurisdiction.level === "federal" && order.flagTypes.includes("us") && order.scope === "nationwide");
  const overrides = await db.select().from(manualOverrides).where(and(eq(manualOverrides.active, 1), or(isNull(manualOverrides.expiresAt), gt(manualOverrides.expiresAt, checkedAt))));
  const existing = await db.select().from(currentStatus);
  const directlyMonitoredJurisdictions = new Set(monitoredSources.filter((source) => source.id === "tx-flag-status" || source.id === "ok-flag-status" || stateStatusPatterns[source.id]).map((source) => source.jurisdictionId));

  for (const jurisdiction of allJurisdictions) {
    for (const flagType of ["us", "state"] as FlagType[]) {
      const override = overrides.find((value) => value.jurisdictionId === jurisdiction.id && value.flagType === flagType);
      const matchingOrders = activeOrders.filter((order) => order.flagTypes.includes(flagType) && appliesToJurisdiction(order, jurisdiction.id));
      const priorDirect = existing.find((value) => value.id === `current-${jurisdiction.id}-${flagType}` && value.sourceId && value.sourceId !== "white-house-presidential-actions");
      let status: StatusValue;
      let orderIds: string[];
      let reason: string;
      if (override) {
        status = override.status;
        orderIds = [];
        reason = `Manual override: ${override.reason}`;
      } else if (federalOrder) {
        status = flagType === "us" ? "half_mast" : "below_us";
        orderIds = [federalOrder.id];
        reason = flagType === "us" ? federalOrder.reason : "Federal U.S. flag order is active; the state flag remains below the U.S. flag.";
      } else if (matchingOrders.length) {
        status = matchingOrders.length ? "half_mast" : "full_mast";
        orderIds = matchingOrders.map((order) => order.id);
        reason = matchingOrders.length ? matchingOrders.map((order) => order.reason).join(" ") : "No current official order found.";
      } else {
        status = directlyMonitoredJurisdictions.has(jurisdiction.id) && priorDirect ? priorDirect.status as StatusValue : "uncertain";
        orderIds = [];
        reason = status === "uncertain" ? "No verified live state source is currently connected for this jurisdiction." : "Official jurisdiction source reports the current status.";
      }
      const id = `current-${jurisdiction.id}-${flagType}`;
      const previous = existing.find((value) => value.id === id);
      const sourceOrder = orderIds.length ? activeOrders.find((order) => order.id === orderIds[0]) : undefined;
      await db.insert(currentStatus).values({ id, jurisdictionId: jurisdiction.id, flagType, status, orderIds, sourceId: sourceOrder ? "white-house-presidential-actions" : priorDirect?.sourceId, sourceUrl: sourceOrder ? sourceFor(matchingOrders) : priorDirect?.sourceUrl, confidence: override ? "manual" : status === "uncertain" ? "review" : "official", checkedAt, coverageNotice }).onConflictDoUpdate({ target: currentStatus.id, set: { status, orderIds, sourceId: sourceOrder ? "white-house-presidential-actions" : priorDirect?.sourceId, sourceUrl: sourceOrder ? sourceFor(matchingOrders) : priorDirect?.sourceUrl, confidence: override ? "manual" : status === "uncertain" ? "review" : "official", checkedAt, coverageNotice } });
      if (!previous || previous.status !== status || JSON.stringify(previous.orderIds) !== JSON.stringify(orderIds)) {
        await db.insert(statusHistory).values({ id: `history-${id}-${checkedAt.getTime()}`, jurisdictionId: jurisdiction.id, flagType, status, orderIds, observedAt: checkedAt, sourceUrl: sourceFor(matchingOrders), reason });
      }
    }
  }
}

export async function getCurrentStatuses(db: Database, jurisdictionId: string) {
  return db.select().from(currentStatus).where(eq(currentStatus.jurisdictionId, jurisdictionId));
}

export async function getAllCurrentStatuses(db: Database) {
  return db.select({ status: currentStatus, jurisdiction: jurisdictions }).from(currentStatus).innerJoin(jurisdictions, eq(currentStatus.jurisdictionId, jurisdictions.id));
}

export async function applyDirectStatus(db: Database, jurisdictionId: string, parsed: ParsedJurisdictionStatus, checkedAt = new Date()) {
  for (const flagType of parsed.flagTypes) {
    const id = `current-${jurisdictionId}-${flagType}`;
    const previous = (await db.select().from(currentStatus).where(eq(currentStatus.id, id)))[0];
    await db.insert(currentStatus).values({ id, jurisdictionId, flagType, status: parsed.status, orderIds: [], sourceId: parsed.snapshot.sourceId, sourceUrl: parsed.snapshot.url, confidence: parsed.needsReview ? "review" : "official", checkedAt, coverageNotice }).onConflictDoUpdate({ target: currentStatus.id, set: { status: parsed.status, orderIds: [], sourceId: parsed.snapshot.sourceId, sourceUrl: parsed.snapshot.url, confidence: parsed.needsReview ? "review" : "official", checkedAt, coverageNotice } });
    if (!previous || previous.status !== parsed.status) {
      await db.insert(statusHistory).values({ id: `history-${id}-${checkedAt.getTime()}`, jurisdictionId, flagType, status: parsed.status, orderIds: [], observedAt: checkedAt, sourceUrl: parsed.snapshot.url, reason: parsed.reason || `Official source reports ${parsed.status}.` });
    }
  }
}
