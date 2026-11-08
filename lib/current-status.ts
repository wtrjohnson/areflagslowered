import { getRuntimeDb } from "../lib/runtime-db.ts";
import { listRecentOfficialOrders } from "../db/orders.ts";
import { publicStatusAnswer, resolveLiveStatus } from "../lib/live-status.ts";
import type { JurisdictionDefinition } from "../lib/jurisdictions.ts";
import type { StatusAnswer } from "../lib/types.ts";

/** A safe, server-renderable status snapshot for public pages. */
export async function currentPublicStatus(jurisdiction: JurisdictionDefinition): Promise<StatusAnswer | undefined> {
  try {
    const db = await getRuntimeDb();
    const answer = await resolveLiveStatus(db, jurisdiction);
    return publicStatusAnswer({ ...answer, recentOrders: await listRecentOfficialOrders(db, jurisdiction.id) });
  } catch {
    return undefined;
  }
}
