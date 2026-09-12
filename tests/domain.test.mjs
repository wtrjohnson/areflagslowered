import test from "node:test";
import assert from "node:assert/strict";

const { answerStatus } = await import("../lib/answer-engine.ts");
const { createSocialDraft } = await import("../lib/social.ts");
const { renderStatusText } = await import("../lib/render.ts");

const order = {
  id: "test-order", title: "Test order", reason: "A test reason.",
  issuingAuthority: "Test authority",
  jurisdiction: { id: "us", name: "United States", level: "federal" },
  flagTypes: ["us", "state"], scope: "nationwide",
  effectiveStart: "2026-09-06", effectiveEnd: "2026-09-08", effectiveEndTime: "18:00", effectiveEndCondition: "clock", timeZone: "local",
  sourceUrl: "https://example.gov/order", sourceSnapshotId: "test-snapshot",
  status: "published", createdAt: "2026-09-07T00:00:00Z",
};

test("nationwide order applies to both flags in a selected state", () => {
  const answer = answerStatus({ location: "New York, NY", stateCode: "NY", date: "2026-09-07", checkedAt: "2026-09-07T00:00:00Z", orderRecords: [order] });
  assert.equal(answer.status, "half_mast");
  assert.deepEqual(answer.flagResults.map((result) => result.status), ["half_mast", "half_mast"]);
});

test("federal order does not incorrectly call the state flag full mast", () => {
  const federalOnly = { ...order, id: "federal-only", flagTypes: ["us"] };
  const answer = answerStatus({ location: "New York, NY", stateCode: "NY", date: "2026-09-07", checkedAt: "2026-09-07T00:00:00Z", orderRecords: [federalOnly] });
  const stateResult = answer.flagResults.find((result) => result.flagType === "state");
  assert.equal(stateResult.status, "below_us");
  assert.match(stateResult.explanation, /must remain below/);
});

test("no active order returns full mast", () => {
  const answer = answerStatus({ location: "Texas, TX", stateCode: "TX", date: "2026-09-20", checkedAt: "2026-09-07T00:00:00Z" });
  assert.equal(answer.status, "full_mast");
  assert.match(answer.flagResults[0].explanation, /full mast/);
});

test("social drafts are reviewable and source-linked", () => {
  const answer = answerStatus({ location: "New York, NY", stateCode: "NY", date: "2026-09-07", orderRecords: [order] });
  const draft = createSocialDraft(answer.applicableOrders[0], "2026-09-07T00:00:00Z");
  assert.equal(draft.status, "draft");
  assert.match(draft.text, /Official source:/);
});

test("active order text explains why, where, when, and source", () => {
  const answer = answerStatus({ location: "New York, NY", stateCode: "NY", date: "2026-09-07", orderRecords: [order] });
  const text = renderStatusText(answer);
  assert.match(text, /Why: A test reason\./);
  assert.match(text, /Where: Nationwide/);
  assert.match(text, /When: September 6, 2026 through September 8, 2026/);
  assert.match(text, /Source: https:\/\/example\.gov\/order/);
  assert.match(text, /September 8, 2026 at 18:00/);
});

test("exact end time changes the answer on the final day", () => {
  const endingToday = { ...order, effectiveEnd: "2026-09-07", effectiveEndTime: "18:00" };
  const beforeEnd = answerStatus({ location: "New York, NY", stateCode: "NY", date: "2026-09-07", time: "17:59", orderRecords: [endingToday] });
  const afterEnd = answerStatus({ location: "New York, NY", stateCode: "NY", date: "2026-09-07", time: "18:00", orderRecords: [endingToday] });
  assert.equal(beforeEnd.status, "half_mast");
  assert.equal(afterEnd.status, "full_mast");
});

test("a dated order takes precedence over a conflicting persisted status page", () => {
  const answer = answerStatus({
    location: "Pennsylvania, PA",
    stateCode: "PA",
    date: "2026-09-07",
    orderRecords: [{ ...order, id: "pa-order", jurisdiction: { id: "pa", name: "Pennsylvania", stateCode: "PA", level: "state" }, flagTypes: ["us", "state"], scope: "statewide" }],
    currentStatuses: [{ flagType: "state", status: "full_mast", sourceUrl: "https://www.pa.gov/flag-status" }],
  });
  assert.equal(answer.flagResults.find((result) => result.flagType === "state")?.status, "half_mast");
});
