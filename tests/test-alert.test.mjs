import assert from "node:assert/strict";
import test from "node:test";

const { createTestAlertResult, scenarioFromExtraction } = await import("../lib/test-alert.ts");
const { createXTestPostDraft } = await import("../lib/social.ts");

test("dry test alerts use a simulated tokenized state URL without persistence", () => {
  const result = createTestAlertResult({
    stateCode: "NJ",
    reason: "In memory of Sandra Bolden Cunningham.",
    effectiveStart: "2026-10-17",
    effectiveEnd: "2026-10-18",
    alertType: "new",
    usStatus: "full_mast",
    stateStatus: "half_mast",
  });
  assert.equal(result.jurisdiction.name, "New Jersey");
  assert.match(result.simulatedShareUrl, /\/new-jersey\?share=[A-Za-z0-9_-]{22}$/);
  assert.match(result.socialText, /New Jersey half-mast order/);
  assert.match(result.socialText, /Sandra Bolden Cunningham/);
  assert.match(result.notes[0], /no order, email, database record, social draft, snapshot, or X post/i);
});

test("email extraction scenarios preserve independent mast positions", () => {
  const scenario = scenarioFromExtraction({
    alertType: "new", flagTypes: ["state"], stateName: "New Jersey", stateCode: "NJ", geographicScope: "statewide", countyName: null, localityName: null,
    title: "New Jersey alert", reason: "In memory of Sandra Bolden Cunningham.", namedEntities: ["Sandra Bolden Cunningham"], issuingAuthority: "Governor", effectiveStart: "2026-10-17", effectiveStartTime: null, effectiveEnd: "2026-10-18", effectiveEndTime: null, effectiveEndCondition: null, timeZone: "America/New_York", instructionText: "Lower flags.", externalId: null,
  });
  assert.equal(scenario.usStatus, "full_mast");
  assert.equal(scenario.stateStatus, "half_mast");
});

test("X test posts are clearly labelled and retain a real-sized share token", () => {
  const token = "Zk4p8N2q7Rw3Vt6Bx9LmQa";
  const draft = createXTestPostDraft({
    id: "test-order", title: "Test", reason: "In memory of Sandra Bolden Cunningham.", issuingAuthority: "Test console",
    jurisdiction: { id: "nj", name: "New Jersey", stateCode: "NJ", level: "state" }, flagTypes: ["state"], scope: "statewide", instructionType: "order", instructionText: "Test", effectiveStart: "2026-10-17", sourceUrl: "https://example.com", sourceSnapshotId: "test-snapshot", status: "needs_review", createdAt: "2026-10-17T00:00:00.000Z",
  }, "2026-10-17T00:00:00.000Z", token);
  assert.match(draft.text, /^TEST — New Jersey half-mast alert:/);
  assert.match(draft.text, /\/new-jersey\?share=Zk4p8N2q7Rw3Vt6Bx9LmQa$/);
  assert.ok(Array.from(draft.text).length <= 280);
});
