import test from "node:test";
import assert from "node:assert/strict";
const { discoverOklahomaFlagReleases, parseOklahomaFlagRelease } = await import("../lib/sources/oklahoma-newsroom.ts");
test("discovers Oklahoma flag releases from the official JSON feed", () => assert.deepEqual(discoverOklahomaFlagReleases('{"items":[{"newsUrl":"/governor/newsroom/2026/flags-flown-at-half-staff.html","title":"Flags Flown at Half-Staff"}]}'), ["https://oklahoma.gov/governor/newsroom/2026/flags-flown-at-half-staff.html"]));
test("parses Oklahoma release reason and dates", () => {
  const order = parseOklahomaFlagRelease({ url: "https://oklahoma.gov/example.html", html: "<h1>Flags at Half-Staff</h1><p>Governor Kevin Stitt has directed all flags to be flown at half-staff in honor of U.S. Fish and Wildlife Service Officer David Taylor.</p><p>Flags shall be flown at half-staff from sunrise on Tuesday, September 1, 2026, until sunset on Friday, September 4, 2026.</p>" });
  assert.equal(order?.effectiveStart, "2026-09-01"); assert.equal(order?.effectiveEnd, "2026-09-04"); assert.match(order?.reason || "", /David Taylor/);
});

test("parses Oklahoma remembrance wording and a single-day order", () => {
  const order = parseOklahomaFlagRelease({ url: "https://oklahoma.gov/example.html", html: "<h1>Flags at Half-Staff</h1><p>Governor Kevin Stitt issued an order directing flags to be flown at half-staff on Friday, September 11, 2026, in remembrance of the victims of the September 11 attacks.</p>" });
  assert.equal(order?.reason, "the victims of the September 11 attacks");
  assert.equal(order?.effectiveStart, "2026-09-11");
  assert.equal(order?.effectiveEnd, "2026-09-11");
  assert.equal(order?.status, "needs_review");
});
