import test from "node:test";
import assert from "node:assert/strict";

const { createXPostDraft } = await import("../lib/social.ts");

const order = {
  id: "afe-example",
  title: "Half-staff order",
  reason: "In memory of a public servant whose contribution to the community will be remembered.",
  issuingAuthority: "Governor",
  jurisdiction: { id: "co", name: "Colorado", stateCode: "CO", level: "state" },
  flagTypes: ["us", "state"],
  scope: "statewide",
  instructionType: "order",
  instructionText: "Lower flags.",
  effectiveStart: "2026-10-16",
  sourceUrl: "https://flagsexpress.com/notice",
  sourceSnapshotId: "afe-snapshot-123",
  status: "published",
  alertType: "new",
  createdAt: "2026-10-16T00:00:00.000Z",
};

test("X draft is concise, source-linked, and idempotent per source snapshot", () => {
  const draft = createXPostDraft(order, "2026-10-16T00:00:00.000Z");
  assert.equal(draft.id, "x-afe-example-afe-snapshot-123");
  assert.equal(draft.status, "draft");
  assert.match(draft.text, /^New half-mast order:/);
  assert.match(draft.text, /Source: https:\/\/flagsexpress\.com\/notice/);
  assert.ok(Array.from(draft.text).length <= 280);
});

test("X draft clearly identifies a correction", () => {
  const draft = createXPostDraft({ ...order, alertType: "correction" });
  assert.match(draft.text, /^Correction:/);
});
