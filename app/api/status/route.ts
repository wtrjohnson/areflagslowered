import { NextResponse } from "next/server";
import { answerStatus } from "../../../lib/answer-engine.ts";
import { renderStatusText } from "../../../lib/render.ts";
import { getDb } from "../../../db/index.ts";
import { listActiveOrders } from "../../../db/orders.ts";
import { getCurrentStatuses } from "../../../db/status.ts";
import { orders as fallbackOrders } from "../../../lib/data.ts";
import { demoOrders } from "../../../lib/demo-data.ts";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const location = url.searchParams.get("location") || "the United States";
  const stateCode = url.searchParams.get("state") || undefined;
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const time = url.searchParams.get("time") || undefined;
  const demo = url.searchParams.get("demo");
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
    const jurisdictionId = stateCode?.toLowerCase() || "us";
    persistedStatuses = await getCurrentStatuses(db, jurisdictionId);
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
      if (wantsText) return new Response(renderStatusText(localAnswer), { headers: { "content-type": "text/plain; charset=utf-8" } });
      return NextResponse.json({ ...localAnswer, summary: renderStatusText(localAnswer).split("\n")[0] });
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
  if (wantsText) {
    return new Response(renderStatusText(answer), { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.json({ ...answer, summary: renderStatusText(answer).split("\n")[0] });
}
