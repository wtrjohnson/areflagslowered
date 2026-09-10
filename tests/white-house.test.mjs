import test from "node:test";
import assert from "node:assert/strict";

const { discoverWhiteHouseLinks, isHalfStaffCandidate, parseWhiteHouseProclamation } = await import("../lib/sources/white-house.ts");
const { parseTexasFlagStatus } = await import("../lib/sources/texas.ts");
const { parseStateStatusPage, stateStatusPatterns } = await import("../lib/sources/state-status.ts");

const dolly = `<h1>HONORING THE MEMORY OF DOLLY PARTON</h1><p>August 25, 2026</p><p>As a mark of respect, I hereby order that the flag of the United States shall be flown at half-staff throughout the United States until sunset, September 1, 2026.</p>`;
const memorial = `<h1>MEMORIAL DAY, 2026</h1><p>May 22, 2026</p><p>I request the Governors to direct that on Memorial Day, May 25, 2026, the flag be flown at half-staff until noon.</p>`;

test("discovers only presidential action links", () => {
  assert.deepEqual(discoverWhiteHouseLinks('<a href="/presidential-actions/2026/08/example/">one</a><a href="/news/">no</a>'), ["https://www.whitehouse.gov/presidential-actions/2026/08/example/"]);
});

test("parses a nationwide order and its end date", () => {
  const result = parseWhiteHouseProclamation({ html: dolly, url: "https://www.whitehouse.gov/presidential-actions/2026/08/honoring-the-memory-of-dolly-parton/", retrievedAt: "2026-09-07T00:00:00Z" });
  assert.equal(result.needsReview, false);
  assert.equal(result.order.effectiveStart, "2026-08-25");
  assert.equal(result.order.effectiveEnd, "2026-09-01");
  assert.equal(result.order.instructionType, "order");
});

test("normalizes an exact clock end time and preserves the reason", () => {
  const result = parseWhiteHouseProclamation({ html: `<h1>DEATH OF SENATOR TEST</h1><p>July 13, 2026</p><p>As a mark of respect for the memory and service of Senator Test, I hereby order that the flag shall be flown at half-staff until 6:00 p.m. on July 18, 2026.</p>`, url: "https://www.whitehouse.gov/presidential-actions/2026/07/death-of-senator-test/" });
  assert.equal(result.order.effectiveEndTime, "18:00");
  assert.equal(result.order.effectiveEndCondition, "clock");
  assert.match(result.order.reason, /As a mark of respect/);
});

test("recognizes a half-staff candidate and flags request language for reviewable interpretation", () => {
  assert.equal(isHalfStaffCandidate(memorial), true);
  const result = parseWhiteHouseProclamation({ html: memorial, url: "https://www.whitehouse.gov/presidential-actions/2026/05/memorial-day-2026/" });
  assert.equal(result.order.instructionType, "request");
  assert.equal(result.order.effectiveStart, "2026-05-25");
  assert.equal(result.order.effectiveEnd, "2026-05-25");
});

test("returns review metadata when a page has no clear effective period", () => {
  const result = parseWhiteHouseProclamation({ html: "<h1>Unclear action</h1><p>January 1, 2026</p><p>The flag was mentioned, but there is no effective period.</p>", url: "https://www.whitehouse.gov/presidential-actions/2026/01/unclear/" });
  assert.equal(result.needsReview, true);
  assert.equal(result.order, undefined);
  assert.match(result.reason, /end/);
});

test("parses the Texas current status page", () => {
  const result = parseTexasFlagStatus({ html: "<title>Half-Staff | Office of the Texas Governor</title><h1>Flag Status: Half-Staff</h1><h2>The Texas flag is at half-staff today.</h2>", retrievedAt: "2026-09-08T00:00:00Z" });
  assert.equal(result.status, "half_mast");
  assert.deepEqual(result.flagTypes, ["us", "state"]);
  assert.equal(result.needsReview, false);
});

test("marks an unrecognized Texas status page for review", () => {
  const result = parseTexasFlagStatus({ html: "<h1>Flag Status</h1><p>The page has changed.</p>" });
  assert.equal(result.status, "uncertain");
  assert.equal(result.needsReview, true);
  assert.equal(result.snapshot.parserStatus, "failed");
});

test("parses representative state status pages with the shared adapter", () => {
  const pa = parseStateStatusPage({ sourceId: "pa-flag-notices", url: "https://www.pa.gov/agencies/dgs/flag-notices", pattern: stateStatusPatterns["pa-flag-notices"], html: "United States Flag: Full-Staff Commonwealth Flag: Full-Staff" });
  const nj = parseStateStatusPage({ sourceId: "nj-flag-status", url: "https://www.nj.gov/state/dos-flag-status.shtml", pattern: stateStatusPatterns["nj-flag-status"], html: "All Flags Half-Staff" });
  const ma = parseStateStatusPage({ sourceId: "ma-flag-status", url: "https://www.mass.gov/info-details/flag-status", pattern: stateStatusPatterns["ma-flag-status"], html: "Flags are flying at full staff." });
  const fl = parseStateStatusPage({ sourceId: "fl-flag-information", url: "https://flgov.com/eog/info/flag-information", pattern: stateStatusPatterns["fl-flag-information"], html: "Flag Status: Full Staff" });
  const wa = parseStateStatusPage({ sourceId: "wa-flag-lowering", url: "https://governor.wa.gov/official-actions/flag-lowering-and-display", pattern: stateStatusPatterns["wa-flag-lowering"], html: "Flag Status - Full staff" });
  assert.equal(pa.status, "full_mast");
  assert.equal(nj.status, "half_mast");
  assert.equal(ma.status, "full_mast");
  assert.equal(fl.status, "full_mast");
  assert.equal(wa.status, "full_mast");
});
