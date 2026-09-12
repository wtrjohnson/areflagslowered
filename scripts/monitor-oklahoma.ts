import { getDb } from "../db/index.ts";
import { upsertOrder, upsertSource, upsertSourceSnapshot } from "../db/orders.ts";
import { OKLAHOMA_NEWSROOM_FEED_URL, OKLAHOMA_NEWSROOM_URL, discoverOklahomaFlagReleases, parseOklahomaFlagRelease } from "../lib/sources/oklahoma-newsroom.ts";

const db = getDb();
const now = new Date().toISOString();
await upsertSource(db, { id: "ok-newsroom", jurisdictionId: "ok", name: "Oklahoma Governor Newsroom", url: OKLAHOMA_NEWSROOM_URL, sourceType: "newsroom", parserName: "oklahoma_flag_release", priority: "secondary", timeZone: "America/Chicago", pollIntervalMinutes: 30 });
const indexHtml = await (await fetch(OKLAHOMA_NEWSROOM_FEED_URL, { headers: { "user-agent": "AreFlagsLowered/0.1 (+source-monitoring)" } })).text();
const releaseUrls = discoverOklahomaFlagReleases(indexHtml).slice(0, 10);
if (!releaseUrls.length) { console.log(JSON.stringify({ status: "no_release_found", checkedAt: now })); process.exit(0); }
const candidates = [];
for (const releaseUrl of releaseUrls) {
  const html = await (await fetch(releaseUrl, { headers: { "user-agent": "AreFlagsLowered/0.1 (+source-monitoring)" } })).text();
  const parsed = parseOklahomaFlagRelease({ html, url: releaseUrl, retrievedAt: now });
  if (parsed) candidates.push(parsed);
}
const today = now.slice(0, 10);
const order = candidates.sort((a, b) => {
  const aCurrent = a.effectiveEnd >= today ? 1 : 0;
  const bCurrent = b.effectiveEnd >= today ? 1 : 0;
  return bCurrent - aCurrent || b.effectiveEnd.localeCompare(a.effectiveEnd) || b.effectiveStart.localeCompare(a.effectiveStart);
})[0];
if (!order) { console.log(JSON.stringify({ status: "needs_review", sourceUrl: releaseUrls[0], checkedAt: now })); process.exit(0); }
await upsertSourceSnapshot(db, order.snapshot);
await upsertOrder(db, order);
console.log(JSON.stringify({ status: "ingested", order: { id: order.id, reason: order.reason, effectiveStart: order.effectiveStart, effectiveEnd: order.effectiveEnd, sourceUrl: order.sourceUrl }, checkedAt: now }));
