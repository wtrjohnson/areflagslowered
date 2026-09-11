import { getDb } from "../db/index.ts";
import { applyDirectStatus } from "../db/status.ts";
import { finishIngestionRun, getSource, listActiveOrders, recordSourceCheck, startIngestionRun, upsertJurisdiction, upsertSource, upsertSourceSnapshot, updateSourceHealth } from "../db/orders.ts";
import { monitoredSources } from "../lib/source-registry.ts";
import { jurisdictionCatalog } from "../lib/jurisdictions.ts";
import { parseTexasFlagStatus } from "../lib/sources/texas.ts";
import { parseStateStatusPage, stateStatusPatterns } from "../lib/sources/state-status.ts";
import { OKLAHOMA_FULL_URL, OKLAHOMA_HALF_URL, parseOklahomaFlagStatus } from "../lib/sources/oklahoma.ts";

const db = getDb();
const now = new Date();
const date = now.toISOString().slice(0, 10);
const federalOrders = (await listActiveOrders(db, date)).filter((order) => order.jurisdiction.level === "federal" && order.flagTypes.includes("us") && order.scope === "nationwide");
if (federalOrders.length) {
  console.log(JSON.stringify({ skipped: true, reason: "Federal half-staff order is active; federal status controls all jurisdictions." }));
  process.exit(0);
}

const supported = monitoredSources.filter((source) => source.id === "tx-flag-status" || source.id === "ok-flag-status" || stateStatusPatterns[source.id]);
const results: Array<Record<string, unknown>> = [];
for (const source of supported) {
  const runId = `state-${source.id}-${now.getTime()}`;
  const checkId = `check-${source.id}-${now.getTime()}`;
  const started = Date.now();
  const jurisdiction = jurisdictionCatalog.find((value) => value.id === source.jurisdictionId);
  await upsertJurisdiction(db, jurisdiction || { id: source.jurisdictionId, name: source.jurisdictionId.toUpperCase(), stateCode: source.jurisdictionId.toUpperCase(), level: "state" });
  await upsertSource(db, source);
  await startIngestionRun(db, runId, source.id);
  const storedSource = await getSource(db, source.id);
  try {
    const headers = new Headers({ "user-agent": "AreFlagsLowered/0.1 (+source-monitoring)" });
    // Oklahoma's homepage is the active-status selector. Fetch it each run so
    // a cached 304 cannot preserve a prior parser-review result after the
    // homepage link changes or the adapter is corrected.
    if (source.id !== "ok-flag-status") {
      if (storedSource?.etag) headers.set("if-none-match", storedSource.etag);
      if (storedSource?.lastModified) headers.set("if-modified-since", storedSource.lastModified);
    }
    const response = await fetch(source.url, { headers });
    const latencyMs = Date.now() - started;
    const etag = response.headers.get("etag") || undefined;
    const lastModified = response.headers.get("last-modified") || undefined;
    if (response.status === 304) {
      await recordSourceCheck(db, { id: checkId, sourceId: source.id, ingestionRunId: runId, status: "unchanged", httpStatus: 304, responseLatencyMs: latencyMs, etag, lastModified });
      await updateSourceHealth(db, source.id, { checkedAt: now, successful: true, latencyMs, etag, lastModified });
      await finishIngestionRun(db, runId, "completed", 0);
      results.push({ jurisdiction: source.jurisdictionId, status: "unchanged", httpStatus: 304, latencyMs });
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const parsed = source.id === "tx-flag-status"
      ? parseTexasFlagStatus({ html, url: source.url, retrievedAt: now.toISOString() })
      : source.id === "ok-flag-status"
        ? parseOklahomaFlagStatus({ homeHtml: html, fullHtml: await (await fetch(OKLAHOMA_FULL_URL, { headers: new Headers({ "user-agent": "AreFlagsLowered/0.1 (+source-monitoring)" }) })).text(), halfHtml: await (await fetch(OKLAHOMA_HALF_URL, { headers: new Headers({ "user-agent": "AreFlagsLowered/0.1 (+source-monitoring)" }) })).text(), retrievedAt: now.toISOString() })
      : parseStateStatusPage({ html, sourceId: source.id, url: source.url, pattern: stateStatusPatterns[source.id], retrievedAt: now.toISOString() });
    await upsertSourceSnapshot(db, parsed.snapshot);
    await recordSourceCheck(db, { id: checkId, sourceId: source.id, ingestionRunId: runId, status: parsed.needsReview ? "failed" : "changed", httpStatus: response.status, responseLatencyMs: latencyMs, contentHash: parsed.snapshot.contentHash, etag, lastModified, error: parsed.needsReview ? "Parser could not determine a confident current status." : undefined });
    await updateSourceHealth(db, source.id, { checkedAt: now, successful: !parsed.needsReview, latencyMs, etag, lastModified });
    if (!parsed.needsReview) await applyDirectStatus(db, source.jurisdictionId, parsed, now);
    await finishIngestionRun(db, runId, parsed.needsReview ? "failed" : "completed", parsed.needsReview ? 0 : 1, parsed.needsReview ? "Parser review required" : undefined);
    results.push({ jurisdiction: source.jurisdictionId, status: parsed.status, needsReview: parsed.needsReview, httpStatus: response.status, latencyMs });
  } catch (error) {
    const latencyMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    await recordSourceCheck(db, { id: checkId, sourceId: source.id, ingestionRunId: runId, status: "failed", responseLatencyMs: latencyMs, error: message });
    await updateSourceHealth(db, source.id, { checkedAt: now, successful: false, latencyMs });
    await finishIngestionRun(db, runId, "failed", 0, message);
    results.push({ jurisdiction: source.jurisdictionId, status: "uncertain", needsReview: true, error: message, latencyMs });
  }
}
console.log(JSON.stringify({ checked: results.length, results, checkedAt: now.toISOString() }));
