import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  WHITE_HOUSE_SEARCH_URL,
  discoverWhiteHouseLinks,
  fetchWhiteHouseDocument,
  isHalfStaffCandidate,
  parseWhiteHouseProclamation,
} from "../lib/sources/white-house.ts";
import { getDb } from "../db/index.ts";
import { finishIngestionRun, recordSourceCheck, startIngestionRun, upsertJurisdiction, upsertOrder, upsertSource, upsertSourceSnapshot } from "../db/orders.ts";

type IngestionState = { sources: Record<string, { contentHash: string; checkedAt: string }> };
const statePath = resolve(".data/federal-ingestion.json");
const snapshotDir = resolve(".data/snapshots");

async function readState(): Promise<IngestionState> {
  try { return JSON.parse(await readFile(statePath, "utf8")) as IngestionState; }
  catch { return { sources: {} }; }
}

async function main() {
  const args = process.argv.slice(2);
  const directUrl = args.find((arg) => arg.startsWith("--url="))?.slice(6);
  const limit = Number(args.find((arg) => arg.startsWith("--limit="))?.slice(8) || "25");
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const db = dryRun ? undefined : getDb();
  const state = dryRun ? { sources: {} } : await readState();
  const searchHtml = directUrl ? "" : await fetchWhiteHouseDocument(WHITE_HOUSE_SEARCH_URL);
  const discovered = directUrl ? [directUrl] : discoverWhiteHouseLinks(searchHtml).slice(0, limit);
  const report: Array<Record<string, unknown>> = [];
  const normalizedRecords: Array<Record<string, unknown>> = [];
  let checked = 0;
  const runId = `federal-${new Date().toISOString().replace(/[^0-9]/g, "")}`;

  if (db) {
    await upsertJurisdiction(db, { id: "us", name: "United States", level: "federal" });
    await upsertSource(db, { id: "white-house-presidential-actions", jurisdictionId: "us", name: "White House Presidential Actions", url: WHITE_HOUSE_SEARCH_URL, sourceType: "html_search", parserName: "white_house_proclamation", timeZone: "America/New_York", pollIntervalMinutes: 15 });
    await startIngestionRun(db, runId, "white-house-presidential-actions");
  }

  try {
    for (const url of discovered) {
      const html = await fetchWhiteHouseDocument(url);
      checked += 1;
      if (!isHalfStaffCandidate(html)) continue;
      const parsed = parseWhiteHouseProclamation({ html, url });
      const previous = state.sources[url];
      const isNew = force || !previous || previous.contentHash !== parsed.snapshot.contentHash;

      const snapshotSummary = { id: parsed.snapshot.id, sourceId: parsed.snapshot.sourceId, url: parsed.snapshot.url, retrievedAt: parsed.snapshot.retrievedAt, contentHash: parsed.snapshot.contentHash, parserStatus: parsed.snapshot.parserStatus };
      normalizedRecords.push({ sourceSnapshot: snapshotSummary, order: parsed.order, needsReview: parsed.needsReview, reason: parsed.reason });
      if (!dryRun) {
        state.sources[url] = { contentHash: parsed.snapshot.contentHash, checkedAt: parsed.snapshot.retrievedAt };
        await mkdir(snapshotDir, { recursive: true });
        await writeFile(resolve(snapshotDir, `${parsed.snapshot.id}.html`), html);
      }
      if (db) {
        await upsertSourceSnapshot(db, parsed.snapshot);
        await recordSourceCheck(db, { id: `check-${runId}-${checked}`, sourceId: parsed.snapshot.sourceId, ingestionRunId: runId, status: previous?.contentHash === parsed.snapshot.contentHash ? "unchanged" : "changed", contentHash: parsed.snapshot.contentHash, httpStatus: 200 });
        if (parsed.order) {
          await upsertJurisdiction(db, parsed.order.jurisdiction);
          await upsertOrder(db, parsed.order);
        }
      }
      if (isNew) report.push({ url, title: parsed.order?.title, effectiveStart: parsed.order?.effectiveStart, effectiveEnd: parsed.order?.effectiveEnd, effectiveEndTime: parsed.order?.effectiveEndTime, effectiveEndCondition: parsed.order?.effectiveEndCondition, instructionType: parsed.order?.instructionType, status: parsed.order?.status ?? "needs_review", reason: parsed.reason, sourceSnapshotId: parsed.snapshot.id });
    }
    if (db) await finishIngestionRun(db, runId, "completed", report.length);
  } catch (error) {
    if (db) await finishIngestionRun(db, runId, "failed", report.length, error instanceof Error ? error.message : String(error));
    throw error;
  }

  if (!dryRun) {
    await mkdir(resolve(".data"), { recursive: true });
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  }
  console.log(JSON.stringify(dryRun
    ? { dryRun: true, source: "White House Presidential Actions", checked, records: normalizedRecords }
    : { source: "White House Presidential Actions", checked, newRecords: report.length, records: report }, null, 2));
}

main().catch((error) => {
  console.error(`Federal ingestion failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
