import type { getDb } from "../db/index.ts";
import { listActiveOrders } from "../db/orders.ts";
import { getCurrentStatuses } from "../db/status.ts";
import { answerStatus } from "./answer-engine.ts";
import type { JurisdictionDefinition } from "./jurisdictions.ts";
import type { StatusAnswer } from "./types.ts";

type Database = ReturnType<typeof getDb>;

export function localDateTime(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

export async function resolveLiveStatus(
  db: Database,
  jurisdiction: JurisdictionDefinition,
  options: { now?: Date; date?: string; time?: string } = {},
): Promise<StatusAnswer> {
  const clock = localDateTime(jurisdiction.timeZone, options.now);
  const date = options.date || clock.date;
  const time = options.time ?? (options.date ? undefined : clock.time);
  const orderRecords = await listActiveOrders(db, date);
  const currentStatuses = await getCurrentStatuses(db, jurisdiction.id);
  return answerStatus({
    location: jurisdiction.name,
    stateCode: jurisdiction.stateCode,
    date,
    time,
    checkedAt: (options.now || new Date()).toISOString(),
    orderRecords,
    currentStatuses: currentStatuses.map((status) => ({
      flagType: status.flagType,
      status: status.status,
      orderIds: status.orderIds,
      sourceUrl: status.sourceUrl,
      checkedAt: status.checkedAt,
    })),
  });
}

export function publicStatusAnswer(answer: StatusAnswer): StatusAnswer {
  const strip = (order: StatusAnswer["applicableOrders"][number]) => {
    const { sourceUrl: _sourceUrl, sourceSnapshotId: _sourceSnapshotId, ...safeOrder } = order;
    return safeOrder as StatusAnswer["applicableOrders"][number];
  };
  return {
    ...answer,
    applicableOrders: answer.applicableOrders.map(strip),
    flagResults: answer.flagResults.map((result) => ({ ...result, orders: result.orders.map(strip) })),
    sourceLinks: [],
  };
}

export function flagStatuses(answer: StatusAnswer) {
  return {
    usStatus: answer.flagResults.find((result) => result.flagType === "us")?.status || "uncertain" as const,
    stateStatus: answer.flagResults.find((result) => result.flagType === "state")?.status || "uncertain" as const,
  };
}
