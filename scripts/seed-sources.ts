import { getDb } from "../db/index.ts";
import { upsertSource } from "../db/orders.ts";
import { monitoredSources } from "../lib/source-registry.ts";

const db = getDb();
for (const source of monitoredSources) await upsertSource(db, source);
console.log(`Seeded ${monitoredSources.length} monitored sources.`);
