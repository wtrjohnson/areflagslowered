import { getDb } from "../db/index.ts";
import { sql } from "drizzle-orm";
import { upsertJurisdiction, upsertSource } from "../db/orders.ts";
import { federalJurisdiction } from "../lib/jurisdictions.ts";

const db = getDb();
const afe = { id: "american-flags-express-email", jurisdictionId: "us", name: "American Flags Express email alerts", url: process.env.AFE_SOURCE_URL || "https://flagsexpress.com", sourceType: "email", parserName: "american_flags_express_llm", priority: "primary" as const, timeZone: "America/New_York", pollIntervalMinutes: 0 };
await upsertJurisdiction(db, federalJurisdiction);
await upsertSource(db, afe);
await db.execute(sql`UPDATE sources SET enabled = 0 WHERE id <> ${afe.id}`);
console.log("Seeded American Flags Express as the only active source; legacy sources disabled.");
