import assert from "node:assert/strict";
import test from "node:test";

const { discoverGeorgiaFlagOrders, extractEmbeddedPdfText, parseGeorgiaFlagOrder } = await import("../lib/sources/georgia-orders.ts");

test("discovers Georgia flag-order PDFs", () => {
  assert.deepEqual(discoverGeorgiaFlagOrders('<table><tr><td><a href="/document/2026-executive-order/09042601/download">09.04.26.01</a></td><td class="views-field-field-document-description">Lowering flags to half-staff in honor and memory of Sgt. Christopher Fisher</td></tr></table>'), [{ url: "https://gov.georgia.gov/document/2026-executive-order/09042601/download", title: "Lowering flags to half-staff in honor and memory of Sgt. Christopher Fisher" }]);
});

test("parses Georgia executive-order text", () => {
  const order = parseGeorgiaFlagOrder({ title: "Lowering flags to half-staff", url: "https://gov.georgia.gov/order.pdf", text: "FLAGS ON ALL STATE BUILDINGS ORDERED LOWERED TO HALF-STAFF. In honor and memory of Sgt. Christopher Fisher. It is hereby ordered that the flags be flown at half-staff on Friday, September 4, 2026." });
  assert.equal(order?.status, "published");
  assert.equal(order?.effectiveStart, "2026-09-04");
  assert.equal(order?.effectiveEnd, "2026-09-04");
});

test("parses observance language", () => {
  const order = parseGeorgiaFlagOrder({ title: "Lowering flags to half-staff", url: "https://gov.georgia.gov/order.pdf", text: "It is hereby ordered that flags be flown at half-staff on Friday, September 11, 2026, in observance of Patriot Day." });
  assert.equal(order?.reason, "Patriot Day");
});

test("extracts embedded PDF text when Poppler is unavailable", () => {
  assert.equal(extractEmbeddedPdfText(new TextEncoder().encode("stream\n(FLAGS ON ALL STATE BUILDINGS) Tj (HALF-STAFF) Tj\nendstream")), "FLAGS ON ALL STATE BUILDINGS HALF-STAFF");
});
