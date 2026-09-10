import test from "node:test";
import assert from "node:assert/strict";

const { parseOklahomaFlagStatus } = await import("../lib/sources/oklahoma.ts");

test("Oklahoma parser identifies the official half-staff page", () => {
  const parsed = parseOklahomaFlagStatus({
    homeHtml: '<a href="/governor/flag-status-half.html">Flag Status: Half Staff</a>',
    fullHtml: "<h1>Oklahoma Flag Status - Full</h1>",
    halfHtml: "<h1>Oklahoma Flag Status - Half</h1>",
  });
  assert.equal(parsed.status, "half_mast");
  assert.equal(parsed.needsReview, false);
});

test("Oklahoma parser identifies the official full-staff page", () => {
  const parsed = parseOklahomaFlagStatus({
    homeHtml: '<a href="/governor/flag-status-full.html">Flag Status: Full Staff</a>',
    fullHtml: "<h1>Oklahoma Flag Status - Full</h1><p>All Oklahoma and U.S. flags on state property are at full-staff today.</p>",
    halfHtml: "<h1>Oklahoma Flag Status - Half</h1>",
  });
  assert.equal(parsed.status, "full_mast");
  assert.equal(parsed.needsReview, false);
});

test("Oklahoma parser escalates ambiguous source pages", () => {
  const parsed = parseOklahomaFlagStatus({ homeHtml: "", fullHtml: "", halfHtml: "" });
  assert.equal(parsed.status, "uncertain");
  assert.equal(parsed.needsReview, true);
});

test("Oklahoma parser ignores archived encoded homepage links", () => {
  const parsed = parseOklahomaFlagStatus({
    homeHtml: '<a href="/governor/flag-status-half.html">Flag Status: Half Staff</a><script>"/content/sok-wcm/en/governor/flag-status-full.html"</script>',
    fullHtml: "",
    halfHtml: "",
  });
  assert.equal(parsed.status, "half_mast");
  assert.equal(parsed.needsReview, false);
});
