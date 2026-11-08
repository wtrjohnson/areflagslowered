import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { parseInboundEmail, emailText } = await import("../lib/afe-email.ts");
const { selectOfficialSource } = await import("../lib/official-source.ts");
const { publicReason, validateAfeExtraction } = await import("../lib/afe-extractor.ts");
const { selectStrongCanonicalOrder, validateAfeSender } = await import("../lib/afe-ingestion.ts");
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

test("removes issuer attribution from a public reason", () => {
  assert.equal(publicReason("Flags were lowered to honor Jay Rockefeller, as directed by Morrisey."), "Flags were lowered to honor Jay Rockefeller.");
  assert.equal(publicReason("Flags were ordered by Governor Example."), "Flags were ordered by Governor Example.");
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
    alertType: "new", flagTypes: ["us", "state"], stateName: "Pennsylvania", stateCode: "PA", geographicScope: "county", countyName: "Erie", localityName: null, title: "Bryce Kaufmann", reason: "Honor of Bryce Kaufmann", namedEntities: ["Bryce Kaufmann"], issuingAuthority: "Governor Josh Shapiro", effectiveStart: "2026-09-22", effectiveStartTime: null, effectiveEnd: null, effectiveEndTime: null, effectiveEndCondition: "interment", timeZone: "America/New_York", instructionText: "Flags shall remain lowered until interment.", externalId: null,
  }));
});

test("validates municipal-only notices without treating them as statewide", () => {
  assert.doesNotThrow(() => validateAfeExtraction({
    alertType: "new", flagTypes: ["us", "state"], stateName: "Nebraska", stateCode: "NE", geographicScope: "municipal", countyName: null, localityName: "Yutan", title: "Wendell D. Pascarelli", reason: "Honor of Wendell D. Pascarelli", namedEntities: ["Wendell D. Pascarelli"], issuingAuthority: "Mayor Matt Thompson", effectiveStart: "2026-09-21", effectiveStartTime: null, effectiveEnd: null, effectiveEndTime: null, effectiveEndCondition: "interment", timeZone: "America/Chicago", instructionText: "Flags within the City of Yutan may be lowered to half-staff.", externalId: null,
  }));
});

test("allows a cancellation with no repeated start date", () => {
  assert.doesNotThrow(() => validateAfeExtraction({
    alertType: "cancellation", flagTypes: ["us", "state"], stateName: "Minnesota", stateCode: "MN", geographicScope: "statewide", countyName: null, localityName: null, title: "Leslie R. Washington", reason: "The order is cancelled.", namedEntities: ["Leslie R. Washington"], issuingAuthority: "Governor Tim Walz", effectiveStart: null, effectiveStartTime: null, effectiveEnd: null, effectiveEndTime: null, effectiveEndCondition: null, timeZone: "America/Chicago", instructionText: "The prior order is cancelled.", externalId: null,
  }));
});

test("updates Minnesota's canonical order only with one strong match", () => {
  const revision = {
    alertType: "revision", flagTypes: ["us", "state"], stateName: "Minnesota", stateCode: "MN", geographicScope: "statewide", countyName: null, localityName: null, title: "Leslie R. Washington", reason: "In honor and remembrance of Leslie R. Washington.", namedEntities: ["Leslie R. Washington"], issuingAuthority: "Governor Tim Walz", effectiveStart: "2026-08-14", effectiveStartTime: null, effectiveEnd: "2026-08-19", effectiveEndTime: null, effectiveEndCondition: null, timeZone: "America/Chicago", instructionText: "Flags shall fly at half-staff through August 19.", externalId: null,
  };
  const original = { scope: "statewide", flagTypes: ["us", "state"], effectiveStart: "2026-08-14", issuingAuthority: "Governor Tim Walz", title: "Leslie R. Washington", reason: "In honor and remembrance of Leslie R. Washington." };
  assert.equal(selectStrongCanonicalOrder([original], revision), original);
  assert.equal(selectStrongCanonicalOrder([original, { ...original }], revision), undefined);
});

test("prefers a government proclamation link and never calls AFE official", () => {
  const email = parseInboundEmail([
    "From: American Flags Express <halfstaff@flagsexpress.com>", "Date: Fri, 7 Nov 2026 12:00:00 -0500",
    "Content-Type: text/html", "", '<a href="https://flagsexpress.com/alert">Read alert</a> <a href="https://governor.example.gov/proclamations/flags.pdf">Official proclamation</a>',
  ].join("\n"));
  const source = selectOfficialSource(email);
  assert.equal(source.status, "verified");
  assert.equal(source.url, "https://governor.example.gov/proclamations/flags.pdf");
  assert.equal(source.publisher, "governor.example.gov");
});

test("holds a non-government order link for review and marks a linkless alert unavailable", () => {
  const uncertain = parseInboundEmail(["From: American Flags Express <halfstaff@flagsexpress.com>", "Content-Type: text/plain", "", "Official order: https://example.org/order"].join("\n"));
  assert.equal(selectOfficialSource(uncertain).status, "needs_review");
  const linkless = parseInboundEmail(["From: American Flags Express <halfstaff@flagsexpress.com>", "Content-Type: text/plain", "", "Flags should be lowered."].join("\n"));
  assert.equal(selectOfficialSource(linkless).status, "not_available");
});
