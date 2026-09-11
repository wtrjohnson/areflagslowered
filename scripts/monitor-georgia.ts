import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getDb } from "../db/index.ts";
import { finishIngestionRun, recordSourceCheck, startIngestionRun, updateSourceHealth, upsertJurisdiction, upsertOrder, upsertSource, upsertSourceSnapshot } from "../db/orders.ts";
import { jurisdictionCatalog } from "../lib/jurisdictions.ts";
import { discoverGeorgiaFlagOrders, extractEmbeddedPdfText, GEORGIA_ORDERS_URL, parseGeorgiaFlagOrder } from "../lib/sources/georgia-orders.ts";

const exec = promisify(execFile);
const db = getDb();
const source = { id: "ga-executive-orders", jurisdictionId: "ga", name: "Georgia Executive Flag Orders", url: GEORGIA_ORDERS_URL, sourceType: "directives", parserName: "georgia_pdf_flag_order", priority: "primary" as const, timeZone: "America/New_York", pollIntervalMinutes: 30 };
const now = new Date();
const runId = `directive-${source.id}-${now.getTime()}`;
const started = Date.now();
await upsertJurisdiction(db, jurisdictionCatalog.find((value) => value.id === "ga")!);
await upsertSource(db, source);
await startIngestionRun(db, runId, source.id);
try {
  const headers = { "user-agent": "AreFlagsLowered/0.1 (+source-monitoring)" };
  const indexResponse = await fetch(source.url, { headers });
  if (!indexResponse.ok) throw new Error(`HTTP ${indexResponse.status}`);
  const candidates = discoverGeorgiaFlagOrders(await indexResponse.text());
  if (!candidates.length) throw new Error("No Georgia flag-order PDF found");
  const candidate = candidates[0];
  const pdfResponse = await fetch(candidate.url, { headers });
  if (!pdfResponse.ok) throw new Error(`HTTP ${pdfResponse.status}`);
  const workDir = await mkdtemp(join(tmpdir(), "areflagslowered-ga-"));
  const pdfPath = join(workDir, "order.pdf");
  await writeFile(pdfPath, Buffer.from(await pdfResponse.arrayBuffer()));
  let stdout: string;
  try {
    ({ stdout } = await exec("pdftotext", ["-layout", pdfPath, "-"]));
  } catch (error) {
    if (!(error instanceof Error) || !/ENOENT/.test(error.message)) throw error;
    stdout = extractEmbeddedPdfText(await readFile(pdfPath));
  }
  if (!stdout.trim()) {
    const imagePath = join(workDir, "order");
    await exec("pdftoppm", ["-png", "-f", "1", "-singlefile", pdfPath, imagePath]);
    ({ stdout } = await exec("tesseract", [`${imagePath}.png`, "stdout"]));
  }
  await rm(workDir, { recursive: true, force: true });
  const parsed = parseGeorgiaFlagOrder({ text: stdout, url: candidate.url, title: candidate.title, retrievedAt: now.toISOString() });
  if (!parsed) throw new Error("Georgia PDF requires parser review");
  await upsertSourceSnapshot(db, parsed.snapshot);
  await upsertOrder(db, parsed);
  await recordSourceCheck(db, { id: `check-${runId}`, sourceId: source.id, ingestionRunId: runId, status: "changed", httpStatus: pdfResponse.status, responseLatencyMs: Date.now() - started, contentHash: parsed.snapshot.contentHash });
  await updateSourceHealth(db, source.id, { checkedAt: now, successful: true, latencyMs: Date.now() - started });
  await finishIngestionRun(db, runId, "completed", 1);
  console.log(JSON.stringify({ checked: 1, status: parsed.status, sourceUrl: parsed.sourceUrl, reason: parsed.reason, effectiveStart: parsed.effectiveStart, effectiveEnd: parsed.effectiveEnd }));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  await recordSourceCheck(db, { id: `check-${runId}`, sourceId: source.id, ingestionRunId: runId, status: "failed", responseLatencyMs: Date.now() - started, error: message });
  await updateSourceHealth(db, source.id, { checkedAt: now, successful: false, latencyMs: Date.now() - started });
  await finishIngestionRun(db, runId, "failed", 0, message);
  console.log(JSON.stringify({ checked: 1, status: "needs_review", error: message }));
}
