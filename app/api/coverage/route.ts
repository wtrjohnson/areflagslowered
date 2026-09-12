import { NextResponse } from "next/server";
import { getDb } from "../../../db/index.ts";
import { conflicts, currentStatus, sources } from "../../../db/schema.ts";

function sourceState(source: typeof sources.$inferSelect, now: Date) {
  if (!source.lastCheckedAt) return "never_checked";
  if (source.consecutiveFailures > 0) return "failed";
  const ageMinutes = (now.getTime() - source.lastCheckedAt.getTime()) / 60000;
  return ageMinutes > Math.max(source.pollIntervalMinutes * 2, 120) ? "stale" : "healthy";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const db = getDb();
    const now = new Date();
    const [sourceRows, statusRows, conflictRows] = await Promise.all([
      db.select().from(sources),
      db.select().from(currentStatus),
      db.select().from(conflicts),
    ]);
    const health = sourceRows.map((source) => ({
      id: source.id,
      jurisdictionId: source.jurisdictionId,
      name: source.name,
      sourceType: source.sourceType,
      parserName: source.parserName,
      state: sourceState(source, now),
      lastCheckedAt: source.lastCheckedAt?.toISOString() || null,
      lastSuccessfulAt: source.lastSuccessfulAt?.toISOString() || null,
      consecutiveFailures: source.consecutiveFailures,
      latencyMs: source.lastLatencyMs,
      pollIntervalMinutes: source.pollIntervalMinutes,
      url: source.url,
    }));
    const summary = {
      checkedAt: now.toISOString(),
      sources: {
        total: health.length,
        healthy: health.filter((source) => source.state === "healthy").length,
        stale: health.filter((source) => source.state === "stale").length,
        failed: health.filter((source) => source.state === "failed").length,
        neverChecked: health.filter((source) => source.state === "never_checked").length,
      },
      currentStatuses: statusRows.reduce<Record<string, number>>((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts; }, {}),
      openConflicts: conflictRows.filter((conflict) => conflict.status === "open").length,
    };
    if (url.searchParams.get("format") === "text" || request.headers.get("accept")?.includes("text/plain")) {
      const lines = [
        "SOURCE COVERAGE HEALTH",
        "",
        `Checked: ${summary.checkedAt}`,
        `Sources: ${summary.sources.healthy} healthy | ${summary.sources.stale} stale | ${summary.sources.failed} failed | ${summary.sources.neverChecked} never checked`,
        `Current statuses: ${Object.entries(summary.currentStatuses).map(([status, count]) => `${status}=${count}`).join(" | ") || "none"}`,
        `Open conflicts: ${summary.openConflicts}`,
        "",
        ...health.map((source) => `${source.jurisdictionId || "federal"}: ${source.state.toUpperCase()} | failures=${source.consecutiveFailures} | checked=${source.lastCheckedAt || "never"} | ${source.name}`),
      ];
      return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return NextResponse.json({ summary, sources: health });
  } catch {
    return NextResponse.json({ status: "unavailable", error: "Coverage database unavailable" }, { status: 503 });
  }
}
