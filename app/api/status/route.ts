import { NextResponse } from "next/server";
import { answerStatus } from "../../../lib/answer-engine.ts";
import { renderStatusText } from "../../../lib/render.ts";
import { getDb } from "../../../db/index.ts";
import { listActiveOrders } from "../../../db/orders.ts";
import { renderAllStatusesText } from "../../../lib/render.ts";
import { orders as fallbackOrders } from "../../../lib/data.ts";
import { demoOrders } from "../../../lib/demo-data.ts";
import { allJurisdictions } from "../../../lib/jurisdictions.ts";

function currentLocalDateTime(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function publicAnswer(answer: Awaited<ReturnType<typeof answerStatus>>) {
  const strip = (order: Awaited<ReturnType<typeof answerStatus>>["applicableOrders"][number]) => {
    const { sourceUrl: _sourceUrl, sourceSnapshotId: _snapshotId, ...safeOrder } = order;
    return safeOrder;
  };
  return {
    ...answer,
    applicableOrders: answer.applicableOrders.map(strip),
    flagResults: answer.flagResults.map((result) => ({ ...result, orders: result.orders.map(strip) })),
    sourceLinks: [],
  };
}

const stateTimeZones: Record<string, string> = { AK: "America/Anchorage", HI: "Pacific/Honolulu", AZ: "America/Phoenix", PT: "America/Los_Angeles", CA: "America/Los_Angeles", NV: "America/Los_Angeles", OR: "America/Los_Angeles", WA: "America/Los_Angeles", MT: "America/Denver", ID: "America/Boise", WY: "America/Denver", CO: "America/Denver", UT: "America/Denver", NM: "America/Denver", ND: "America/Chicago", SD: "America/Chicago", NE: "America/Chicago", KS: "America/Chicago", OK: "America/Chicago", TX: "America/Chicago", MN: "America/Chicago", IA: "America/Chicago", MO: "America/Chicago", AR: "America/Chicago", LA: "America/Chicago", WI: "America/Chicago", IL: "America/Chicago", MS: "America/Chicago", AL: "America/Chicago", TN: "America/Chicago", IN: "America/Indiana/Indianapolis", KY: "America/Kentucky/Louisville", OH: "America/New_York", MI: "America/Detroit", WV: "America/New_York", VA: "America/New_York", PA: "America/New_York", NY: "America/New_York", NJ: "America/New_York", DE: "America/New_York", MD: "America/New_York", DC: "America/New_York", NC: "America/New_York", SC: "America/New_York", GA: "America/New_York", FL: "America/New_York", ME: "America/New_York", NH: "America/New_York", VT: "America/New_York", MA: "America/New_York", RI: "America/New_York", CT: "America/New_York" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const location = url.searchParams.get("location") || "the United States";
  const stateCode = url.searchParams.get("state") || undefined;
  const selectedZone = stateTimeZones[stateCode || ""] || "America/New_York";
  const liveClock = currentLocalDateTime(selectedZone);
  const date = url.searchParams.get("date") || liveClock.date;
  const time = url.searchParams.get("time") || (url.searchParams.has("date") ? undefined : liveClock.time);
  const demo = url.searchParams.get("demo");
  const all = url.searchParams.get("all") === "true";
  if (all) {
    try {
      let databaseUrl = process.env.DATABASE_URL;
      try {
        const { env } = await import("cloudflare:workers");
        databaseUrl = (env as { DATABASE_URL?: string }).DATABASE_URL || databaseUrl;
      } catch {
        // Local Node execution uses process.env.
      }
      const db = getDb(databaseUrl);
      const activeOrders = await listActiveOrders(db, date);
      const checkedAt = new Date().toISOString();
      const rows = allJurisdictions.flatMap((jurisdiction) => (["us", "state"] as const).map((flagType) => {
        const matching = activeOrders.filter((order) => order.flagTypes.includes(flagType) && (order.scope === "nationwide" || order.jurisdiction.id === jurisdiction.id));
        const federalOrder = activeOrders.some((order) => order.scope === "nationwide" && order.flagTypes.includes("us"));
        const status: "half_mast" | "full_mast" | "below_us" = matching.length ? "half_mast" : flagType === "state" && federalOrder ? "below_us" : "full_mast";
        return { jurisdiction: { id: jurisdiction.id, name: jurisdiction.name, stateCode: jurisdiction.stateCode || null, level: jurisdiction.level }, status: { jurisdictionId: jurisdiction.id, flagType, status, sourceUrl: null, checkedAt } };
      }));
      const wantsText = url.searchParams.get("format") === "text" || request.headers.get("accept")?.includes("text/plain");
      if (wantsText) return new Response(renderAllStatusesText(rows, checkedAt), { headers: { "content-type": "text/plain; charset=utf-8" } });
      return NextResponse.json({ date, checkedAt, statuses: rows, summary: `All current flag statuses as of ${checkedAt}.` });
    } catch {
      return NextResponse.json({ status: "uncertain", error: "Status database unavailable" }, { status: 503 });
    }
  }
  let orderRecords: Awaited<ReturnType<typeof listActiveOrders>>;
  let persistedStatuses;
  if (process.env.NODE_ENV === "development" && demo && demoOrders[demo]) {
    orderRecords = demoOrders[demo];
  } else {
  try {
    let databaseUrl = process.env.DATABASE_URL;
    try {
      const { env } = await import("cloudflare:workers");
      databaseUrl = (env as { DATABASE_URL?: string }).DATABASE_URL || databaseUrl;
    } catch {
      // Local Node execution uses process.env.
    }
    const db = getDb(databaseUrl);
    orderRecords = await listActiveOrders(db, date);
    persistedStatuses = undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database unavailable";
    if (process.env.NODE_ENV === "development") {
      const answer = answerStatus({ location, stateCode, date, time, orderRecords: fallbackOrders });
      const localAnswer = {
        ...answer,
        coverageNotice: "Local development mode: Neon is not configured, so no ingested official orders are loaded.",
        dataSource: "local_empty_fallback",
      };
      const wantsText = url.searchParams.get("format") === "text" || request.headers.get("accept")?.includes("text/plain");
      const safeLocalAnswer = publicAnswer(localAnswer);
      if (wantsText) return new Response(renderStatusText(safeLocalAnswer), { headers: { "content-type": "text/plain; charset=utf-8" } });
      return NextResponse.json({ ...safeLocalAnswer, summary: renderStatusText(safeLocalAnswer).split("\n")[0] });
    }
    return NextResponse.json({
      status: "uncertain",
      location,
      date,
      flagResults: [],
      applicableOrders: [],
      sourceLinks: [],
      lastCheckedAt: new Date().toISOString(),
      coverageNotice: "The status database is currently unavailable. No status determination was made.",
      error: process.env.NODE_ENV === "development" ? message : "Status service unavailable",
    }, { status: 503 });
  }
  }
  const baseAnswer = answerStatus({ location, stateCode, date, time, orderRecords, currentStatuses: persistedStatuses?.map((status) => ({ flagType: status.flagType, status: status.status, orderIds: status.orderIds, sourceUrl: status.sourceUrl, checkedAt: status.checkedAt })) });
  const answer = demo && process.env.NODE_ENV === "development"
    ? { ...baseAnswer, coverageNotice: "Local demo mode: this response uses a development fixture, not live database data." }
    : baseAnswer;
  const wantsText = url.searchParams.get("format") === "text" || request.headers.get("accept")?.includes("text/plain");
  const safeAnswer = publicAnswer(answer);
  if (wantsText) {
    return new Response(renderStatusText(safeAnswer), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.json({ ...safeAnswer, summary: renderStatusText(safeAnswer).split("\n")[0] });
}
