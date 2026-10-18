import { NextResponse } from "next/server";
import { answerStatus } from "../../../lib/answer-engine.ts";
import { renderStatusText } from "../../../lib/render.ts";
import { getDb } from "../../../db/index.ts";
import { listActiveOrders } from "../../../db/orders.ts";
import { renderAllStatusesText } from "../../../lib/render.ts";
import { orders as fallbackOrders } from "../../../lib/data.ts";
import { demoOrders } from "../../../lib/demo-data.ts";
import { allJurisdictions } from "../../../lib/jurisdictions.ts";
import { jurisdictionByCode } from "../../../lib/jurisdictions.ts";
import { localDateTime, publicStatusAnswer, resolveLiveStatus } from "../../../lib/live-status.ts";
import { getRuntimeDb } from "../../../lib/runtime-db.ts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const location = url.searchParams.get("location") || "the United States";
  const stateCode = url.searchParams.get("state") || undefined;
  const selectedJurisdiction = stateCode ? jurisdictionByCode(stateCode) : undefined;
  const liveClock = localDateTime(selectedJurisdiction?.timeZone || "America/New_York");
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
  if (!(process.env.NODE_ENV === "development" && demo && demoOrders[demo]) && selectedJurisdiction) {
    try {
      const answer = publicStatusAnswer(await resolveLiveStatus(await getRuntimeDb(), selectedJurisdiction, { date, time }));
      const wantsText = url.searchParams.get("format") === "text" || request.headers.get("accept")?.includes("text/plain");
      if (wantsText) return new Response(renderStatusText(answer), { headers: { "content-type": "text/plain; charset=utf-8" } });
      return NextResponse.json({ ...answer, summary: renderStatusText(answer).split("\n")[0] });
    } catch {
      // Preserve the existing development fallback and production uncertainty response below.
    }
  }
  let orderRecords: Awaited<ReturnType<typeof listActiveOrders>>;
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
  const baseAnswer = answerStatus({ location, stateCode, date, time, orderRecords });
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
