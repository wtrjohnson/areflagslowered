import assert from "node:assert/strict";
import test from "node:test";

test("text format is available for readable API consumption", async () => {
  const { answerStatus } = await import("../lib/answer-engine.ts");
  const { renderStatusText } = await import("../lib/render.ts");
  const body = renderStatusText(answerStatus({ location: "New York, NY", stateCode: "NY", date: "2026-09-07", checkedAt: "2026-09-07T12:00:00.000Z" }));
  assert.match(body, /NO: flags should be at full mast/);
  assert.match(body, /Coverage:/);
});

test("local Dolly fixture produces an active federal API answer", async () => {
  const { demoOrders } = await import("../lib/demo-data.ts");
  const { answerStatus } = await import("../lib/answer-engine.ts");
  const answer = answerStatus({ location: "New York, NY", stateCode: "NY", date: "2026-08-28", orderRecords: demoOrders.dolly });
  assert.equal(answer.status, "half_mast");
  assert.equal(answer.flagResults[0].status, "half_mast");
  assert.match(answer.flagResults[0].orders[0].reason, /Dolly Parton/);
});

test("local Dolly fixture expires after its effective end date", async () => {
  const { demoOrders } = await import("../lib/demo-data.ts");
  const { answerStatus } = await import("../lib/answer-engine.ts");
  const answer = answerStatus({ location: "New York, NY", stateCode: "NY", date: "2026-09-02", orderRecords: demoOrders.dolly });
  assert.equal(answer.status, "full_mast");
  assert.deepEqual(answer.flagResults.map((result) => result.status), ["full_mast", "full_mast"]);
});
