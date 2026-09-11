import assert from "node:assert/strict";
import test from "node:test";

test("California WordPress search results identify flag orders", () => {
  const results = [{ title: "Governor orders flags at half-staff", url: "https://www.gov.ca.gov/2026/03/04/flags-half-staff/" }, { title: "Budget announcement", url: "https://www.gov.ca.gov/2026/03/01/budget/" }];
  assert.deepEqual(results.filter((result) => /flag|half[- ]staff|lowered/i.test(result.title)).map((result) => result.url), ["https://www.gov.ca.gov/2026/03/04/flags-half-staff/"]);
});
