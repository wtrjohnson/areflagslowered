import { getRuntimeDb } from "../lib/runtime-db.ts";
import { publicStatusAnswer, resolveLiveStatus } from "../lib/live-status.ts";
import type { JurisdictionDefinition } from "../lib/jurisdictions.ts";
import type { StatusAnswer } from "../lib/types.ts";

/** A safe, server-renderable status snapshot for public pages. */
export async function currentPublicStatus(jurisdiction: JurisdictionDefinition): Promise<StatusAnswer | undefined> {
  try {
    return publicStatusAnswer(await resolveLiveStatus(await getRuntimeDb(), jurisdiction));
  } catch {
    return undefined;
  }
}
