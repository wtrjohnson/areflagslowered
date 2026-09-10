import type { HalfMastOrder } from "./types.ts";

export const demoOrders: Record<string, HalfMastOrder[]> = {
  dolly: [{
    id: "demo-white-house-honoring-the-memory-of-dolly-parton",
    title: "HONORING THE MEMORY OF DOLLY PARTON",
    reason: "Honoring the memory of Dolly Parton",
    issuingAuthority: "The President of the United States",
    jurisdiction: { id: "us", name: "United States", level: "federal" },
    flagTypes: ["us"],
    scope: "nationwide",
    instructionType: "order",
    instructionText: "The flag of the United States shall be flown at half-staff throughout the United States.",
    effectiveStart: "2026-08-25",
    effectiveEnd: "2026-09-01",
    effectiveEndCondition: "sunset",
    timeZone: "local",
    sourceUrl: "https://www.whitehouse.gov/presidential-actions/2026/08/honoring-the-memory-of-dolly-parton/",
    sourceSnapshotId: "demo-dolly-snapshot",
    status: "published",
    createdAt: "2026-09-08T00:00:00.000Z",
  }],
};
