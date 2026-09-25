import { sql } from "drizzle-orm";
import { getDb } from "../db/index.ts";

const db = getDb();
// This is intentionally explicit and separate from normal migrations. It removes
// legacy-derived active data while preserving the tables and parser code.
await db.execute(sql`DELETE FROM social_drafts`);
await db.execute(sql`DELETE FROM federal_status`);
await db.execute(sql`DELETE FROM conflicts`);
await db.execute(sql`DELETE FROM manual_overrides`);
await db.execute(sql`DELETE FROM current_status`);
await db.execute(sql`DELETE FROM status_history`);
await db.execute(sql`DELETE FROM inbound_emails WHERE order_id IS NULL`);
await db.execute(sql`DELETE FROM orders WHERE source_snapshot_id IN (SELECT id FROM source_snapshots WHERE source_id <> 'american-flags-express-email')`);
await db.execute(sql`DELETE FROM source_snapshots WHERE source_id <> 'american-flags-express-email'`);
await db.execute(sql`DELETE FROM source_checks WHERE source_id <> 'american-flags-express-email'`);
await db.execute(sql`DELETE FROM ingestion_runs WHERE source_id <> 'american-flags-express-email'`);
await db.execute(sql`DELETE FROM sources WHERE id <> 'american-flags-express-email'`);
console.log("AFE cutover complete: legacy active data removed and AFE records preserved.");
