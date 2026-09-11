import assert from "node:assert/strict";
import test from "node:test";

const { discoverNewsroomReleases, parseNewsroomRelease } = await import("../lib/sources/newsroom.ts");

const source = { sourceId: "ct-newsroom", jurisdictionId: "ct", jurisdictionName: "Connecticut", stateCode: "CT", authority: "The Governor of Connecticut", indexUrl: "https://example.gov/news", timeZone: "America/New_York" };

test("discovers flag-related newsroom links", () => {
  assert.deepEqual(discoverNewsroomReleases('<a href="/news/flags-half-staff">Flag Status</a><a href="/news/budget">Budget</a>', source.indexUrl), ["https://example.gov/news/flags-half-staff"]);
});

test("parses a dated newsroom order", () => {
  const order = parseNewsroomRelease({ source, url: "https://example.gov/news/flags-half-staff", html: '<h1>Governor Orders Flags to Half-Staff</h1><p>The Governor ordered flags to half-staff in honor of former Governor Jane Doe, who served the state.</p><p>Flags will be at half-staff from August 25, 2026 until sunset on September 1, 2026.</p>' });
  assert.equal(order?.status, "published");
  assert.equal(order?.reason, "former Governor Jane Doe");
  assert.equal(order?.effectiveStart, "2026-08-25");
  assert.equal(order?.effectiveEnd, "2026-09-01");
});

test("parses newsroom dates without repeated years and sunset wording", () => {
  const order = parseNewsroomRelease({ source: { ...source, jurisdictionId: "nm", jurisdictionName: "New Mexico", stateCode: "NM" }, url: "https://example.gov/news/nm", html: '<div>Jun 5, 2025 · Office of the Governor</div><h1>Governor orders flags to half-staff</h1><p>All flags are to half-staff beginning June 5, and lasting through sundown of June 10, in mourning for Officer Timothy Ontiveros of the Bloomfield Police Department.</p>' });
  assert.equal(order?.status, "published");
  assert.equal(order?.effectiveStart, "2025-06-05");
  assert.equal(order?.effectiveEnd, "2025-06-10");
});

test("parses a sunrise-to-sunset single-day order", () => {
  const order = parseNewsroomRelease({ source: { ...source, jurisdictionId: "ar", jurisdictionName: "Arkansas", stateCode: "AR" }, url: "https://governor.arkansas.gov/newsroom/flags", html: '<h1>Governor Orders Flags to Half-Staff</h1><p>The United States flag and the state flag of Arkansas shall be flown at half-staff from sunrise to sunset on Friday, June 28, 2024, in memory of the lives lost.</p>' });
  assert.equal(order?.status, "published");
  assert.equal(order?.effectiveStart, "2024-06-28");
  assert.equal(order?.effectiveEnd, "2024-06-28");
});
