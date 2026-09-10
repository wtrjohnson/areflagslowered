import { getDb } from "../db/index.ts";
import { applyDirectStatus } from "../db/status.ts";
import { listActiveOrders, upsertJurisdiction, upsertSource, upsertSourceSnapshot } from "../db/orders.ts";
import { parseTexasFlagStatus, TEXAS_FLAG_STATUS_URL } from "../lib/sources/texas.ts";

const db = getDb();
const now = new Date();
const date = now.toISOString().slice(0, 10);
const federalOrders = (await listActiveOrders(db, date)).filter((order) => order.jurisdiction.level === "federal" && order.flagTypes.includes("us") && order.scope === "nationwide");
if (federalOrders.length) {
  console.log(JSON.stringify({ jurisdiction: "TX", skipped: true, reason: "Federal half-staff order is active; federal status controls." }));
  process.exit(0);
}
await upsertJurisdiction(db, { id: "tx", name: "Texas", stateCode: "TX", level: "state" });
await upsertSource(db, { id: "tx-flag-status", jurisdictionId: "tx", name: "Texas Flag Status", url: TEXAS_FLAG_STATUS_URL, sourceType: "status_page", parserName: "texas_flag_status", timeZone: "America/Chicago", pollIntervalMinutes: 30 });
const html = await (await fetch(TEXAS_FLAG_STATUS_URL, { headers: { "user-agent": "AreFlagsLowered/0.1 (+source-monitoring)" } })).text();
const parsed = parseTexasFlagStatus({ html });
await upsertSourceSnapshot(db, parsed.snapshot);
await applyDirectStatus(db, "tx", parsed);
console.log(JSON.stringify({ jurisdiction: "TX", status: parsed.status, needsReview: parsed.needsReview, checkedAt: parsed.snapshot.retrievedAt }));
