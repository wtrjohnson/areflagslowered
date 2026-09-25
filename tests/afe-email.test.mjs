import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { parseInboundEmail, emailText } = await import("../lib/afe-email.ts");
const { validateAfeExtraction } = await import("../lib/afe-extractor.ts");
const { validateAfeSender } = await import("../lib/afe-ingestion.ts");
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

test("accepts direct and forwarded American Flags Express alerts", () => {
  assert.equal(validateAfeSender(parseInboundEmail(fixture)), true);

  const forwarded = [
    "From: w@williamj.us",
    "To: alerts@example.com",
    "Subject: Fwd: North Carolina - Half-Staff Alert - Sean Michael Lee",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "---------- Forwarded message ---------",
    "From: American Flags Express <halfstaff@flagsexpress.com>",
    "Subject: North Carolina - Half-Staff Alert - Sean Michael Lee",
    "",
    "Governor Stein ordered North Carolina flags to half-staff in honor of Sean Michael Lee.",
  ].join("\n");

  assert.equal(validateAfeSender(parseInboundEmail(forwarded)), true);
});

test("accepts the trusted forwarder when CloudMailin omits forwarded headers", () => {
  const forwardedWithoutHeaders = [
    "From: w@williamj.us",
    "Subject: Fwd: North Carolina - Half-Staff Alert - Sean Michael Lee",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Governor Stein ordered North Carolina flags to half-staff in honor of Sean Michael Lee.",
  ].join("\n");

  assert.equal(validateAfeSender(parseInboundEmail(forwardedWithoutHeaders)), true);
});

test("rejects unrelated forwarded mail", () => {
  const unrelated = [
    "From: w@williamj.us",
    "Subject: Fwd: Weekly newsletter",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "From: American Flags Express <halfstaff@flagsexpress.com>",
    "Subject: Weekly newsletter",
  ].join("\n");

  assert.equal(validateAfeSender(parseInboundEmail(unrelated)), false);
});

test("validates county alerts without allowing missing geographic fields", () => {
  assert.doesNotThrow(() => validateAfeExtraction({
    alertType: "new", flagTypes: ["us", "state"], stateName: "Pennsylvania", stateCode: "PA", geographicScope: "county", countyName: "Erie", title: "Bryce Kaufmann", reason: "Honor of Bryce Kaufmann", issuingAuthority: "Governor Josh Shapiro", effectiveStart: "2026-09-22", effectiveStartTime: null, effectiveEnd: null, effectiveEndTime: null, effectiveEndCondition: "interment", timeZone: "America/New_York", instructionText: "Flags shall remain lowered until interment.", externalId: null,
  }));
});
