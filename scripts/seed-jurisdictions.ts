import { getDb } from "../db/index.ts";
import { upsertJurisdiction } from "../db/orders.ts";
import { allJurisdictions } from "../lib/jurisdictions.ts";

const db = getDb();
for (const jurisdiction of allJurisdictions) await upsertJurisdiction(db, jurisdiction);
console.log(`Seeded ${allJurisdictions.length} jurisdictions.`);
