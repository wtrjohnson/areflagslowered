import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { parseInboundEmail, emailText } = await import("../lib/afe-email.ts");
const { validateAfeExtraction } = await import("../lib/afe-extractor.ts");
const fixture = await readFile(new URL("./fixtures/Pennsylvania - Half-Staff Alert - Bryce Kaufmann.eml", import.meta.url), "utf8");

test("parses the American Flags Express multipart email and quoted-printable text", () => {
  const email = parseInboundEmail(fixture);
  assert.equal(email.subject, "Pennsylvania - Half-Staff Alert - Bryce Kaufmann");
  assert.equal(email.messageId, "<afe-bryce-kaufmann@example.com>");
  assert.match(email.plainText, /September 22, 2026 through interment/);
  assert.match(email.html, /Bryce Kaufmann/);
  assert.match(emailText(email), /Erie County/);
  assert.match(email.contentHash, /^[a-f0-9]{32}$/);
});

test("validates county alerts without allowing missing geographic fields", () => {
  assert.doesNotThrow(() => validateAfeExtraction({
    alertType: "new", flagTypes: ["us", "state"], stateName: "Pennsylvania", stateCode: "PA", geographicScope: "county", countyName: "Erie", title: "Bryce Kaufmann", reason: "Honor of Bryce Kaufmann", issuingAuthority: "Governor Josh Shapiro", effectiveStart: "2026-09-22", effectiveStartTime: null, effectiveEnd: null, effectiveEndTime: null, effectiveEndCondition: "interment", timeZone: "America/New_York", instructionText: "Flags shall remain lowered until interment.", externalId: null,
  }));
});
