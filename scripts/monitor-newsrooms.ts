import { getDb } from "../db/index.ts";
import { finishIngestionRun, recordSourceCheck, startIngestionRun, upsertJurisdiction, upsertOrder, upsertSource, upsertSourceSnapshot, updateSourceHealth } from "../db/orders.ts";
import { jurisdictionCatalog } from "../lib/jurisdictions.ts";
import { monitoredSources } from "../lib/source-registry.ts";
import { discoverNewsroomReleases, parseNewsroomRelease, type NewsroomSource } from "../lib/sources/newsroom.ts";

const db = getDb();
const now = new Date();
const sources = monitoredSources.filter((source) => source.parserName === "generic_newsroom_order");
const results: Array<Record<string, unknown>> = [];

for (const source of sources) {
  const runId = `newsroom-${source.id}-${now.getTime()}`;
  const checkId = `check-${source.id}-${now.getTime()}`;
  const started = Date.now();
  const jurisdiction = jurisdictionCatalog.find((value) => value.id === source.jurisdictionId);
  await upsertJurisdiction(db, jurisdiction || { id: source.jurisdictionId, name: source.jurisdictionId.toUpperCase(), stateCode: source.jurisdictionId.toUpperCase(), level: "state" });
  await upsertSource(db, source);
  await startIngestionRun(db, runId, source.id);
  try {
    const headers = { "user-agent": "AreFlagsLowered/0.1 (+source-monitoring)" };
    const indexUrls = [source.url, ...Array.from({ length: Math.max(0, (source.crawlPages || 1) - 1) }, (_, index) => new URL(`page/${index + 2}/`, source.url).toString())];
    const releaseUrls: string[] = [];
    for (const indexUrl of indexUrls) {
      const indexResponse = await fetch(indexUrl, { headers });
      if (!indexResponse.ok) continue;
      releaseUrls.push(...discoverNewsroomReleases(await indexResponse.text(), indexUrl));
      if (releaseUrls.length) break;
    }
    const releaseUrl = releaseUrls[0];
    if (!releaseUrl) throw new Error("No flag-related newsroom release found");
    const releaseResponse = await fetch(releaseUrl, { headers });
    if (!releaseResponse.ok) throw new Error(`HTTP ${releaseResponse.status}`);
    const releaseHtml = await releaseResponse.text();
    const parsed = parseNewsroomRelease({ html: releaseHtml, url: releaseUrl, retrievedAt: now.toISOString(), source: { sourceId: source.id, jurisdictionId: source.jurisdictionId, jurisdictionName: jurisdiction?.name || source.jurisdictionId.toUpperCase(), stateCode: jurisdiction?.stateCode || source.jurisdictionId.toUpperCase(), authority: `The Governor of ${jurisdiction?.name || source.jurisdictionId.toUpperCase()}`, indexUrl: source.url, timeZone: source.timeZone } satisfies NewsroomSource });
    if (!parsed) throw new Error("Release requires parser review");
    await upsertSourceSnapshot(db, parsed.snapshot);
    await upsertOrder(db, parsed);
    await recordSourceCheck(db, { id: checkId, sourceId: source.id, ingestionRunId: runId, status: parsed.status === "published" ? "changed" : "failed", httpStatus: releaseResponse.status, responseLatencyMs: Date.now() - started, contentHash: parsed.snapshot.contentHash, error: parsed.status === "published" ? undefined : "Parser review required" });
    await updateSourceHealth(db, source.id, { checkedAt: now, successful: parsed.status === "published", latencyMs: Date.now() - started });
    await finishIngestionRun(db, runId, parsed.status === "published" ? "completed" : "failed", parsed.status === "published" ? 1 : 0, parsed.status === "published" ? undefined : "Parser review required");
    results.push({ jurisdiction: source.jurisdictionId, status: parsed.status, sourceUrl: releaseUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordSourceCheck(db, { id: checkId, sourceId: source.id, ingestionRunId: runId, status: "failed", responseLatencyMs: Date.now() - started, error: message });
    await updateSourceHealth(db, source.id, { checkedAt: now, successful: false, latencyMs: Date.now() - started });
    await finishIngestionRun(db, runId, "failed", 0, message);
    results.push({ jurisdiction: source.jurisdictionId, status: "needs_review", error: message });
  }
}
console.log(JSON.stringify({ checked: results.length, results, checkedAt: now.toISOString() }));
