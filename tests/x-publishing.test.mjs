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

test("X draft uses the public order format and is idempotent per source snapshot", () => {
  const draft = createXPostDraft(order, "2026-10-16T00:00:00.000Z", "Zk4p8N2q7Rw3Vt6Bx9LmQa");
  assert.equal(draft.id, "x-afe-example-afe-snapshot-123");
  assert.equal(draft.status, "draft");
  assert.equal(draft.text, "Colorado half-mast order: In memory of a public servant whose contribution to the community will be remembered.\nOctober, 16\n\nhttps://are-flags-lowered.kvex.chatgpt.site/colorado?share=Zk4p8N2q7Rw3Vt6Bx9LmQa");
  assert.ok(Array.from(draft.text).length <= 280);
});

test("X draft clearly identifies a correction", () => {
  const draft = createXPostDraft({ ...order, alertType: "correction" }, undefined, "Zk4p8N2q7Rw3Vt6Bx9LmQa");
  assert.equal(draft.text, "CORRECTION to Colorado half-mast order: In memory of a public servant whose contribution to the community will be remembered.\n\nhttps://are-flags-lowered.kvex.chatgpt.site/colorado?share=Zk4p8N2q7Rw3Vt6Bx9LmQa");
});

test("X draft uses a compact month-and-day range", () => {
  const draft = createXPostDraft({ ...order, effectiveEnd: "2026-10-18" });
  assert.match(draft.text, /\nOctober, 16–18\n/);
});
