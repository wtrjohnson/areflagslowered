import type { HalfMastOrder, Jurisdiction, SourceSnapshot } from "./types.ts";
import { allJurisdictions } from "./jurisdictions.ts";

const now = "2026-09-07T12:00:00.000Z";

export const jurisdictions: Jurisdiction[] = allJurisdictions;

export const sourceSnapshots: SourceSnapshot[] = [
  {
    id: "snapshot-us-2026-09-07",
    sourceId: "white-house",
    url: "https://www.whitehouse.gov/presidential-actions/",
    retrievedAt: now,
    contentHash: "seed-white-house-20260907",
    content: "Seed source record for local prototype",
    parserStatus: "parsed",
  },
];

// Live records will be populated by the ingestion adapter. Keeping this empty
// prevents the local prototype from presenting an invented order as official.
export const orders: HalfMastOrder[] = [];

export const getState = (value: string) =>
  jurisdictions.find(
    (jurisdiction) =>
      jurisdiction.stateCode?.toLowerCase() === value.toLowerCase() ||
      jurisdiction.name.toLowerCase() === value.toLowerCase(),
  );
