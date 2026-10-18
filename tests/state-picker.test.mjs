import assert from "node:assert/strict";
import test from "node:test";
import { matchesStateFilter, matchesStateQuery } from "../lib/state-picker.ts";

const newYork = { id: "ny", name: "New York", stateCode: "NY", level: "state" };

test("state picker searches names and postal abbreviations", () => {
  assert.equal(matchesStateQuery(newYork, "new"), true);
  assert.equal(matchesStateQuery(newYork, "ny"), true);
  assert.equal(matchesStateQuery(newYork, "texas"), false);
});

test("half-mast filtering includes flags that must remain below the U.S. flag", () => {
  assert.equal(matchesStateFilter("half_mast", "half_mast"), true);
  assert.equal(matchesStateFilter("below_us", "half_mast"), true);
  assert.equal(matchesStateFilter("full_mast", "half_mast"), false);
  assert.equal(matchesStateFilter("uncertain", "all"), true);
});
