import assert from "node:assert/strict";
import test from "node:test";

test("California WordPress search results retain recent pages for parser selection", () => {
  const results = [{ title: "Governor statement", url: "https://www.gov.ca.gov/2026/08/25/statement/" }, { title: "Budget announcement", url: "https://www.gov.ca.gov/2026/08/20/budget/" }];
  assert.deepEqual(results.map((result) => result.url), ["https://www.gov.ca.gov/2026/08/25/statement/", "https://www.gov.ca.gov/2026/08/20/budget/"]);
});
