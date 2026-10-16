import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";

const { flagAssetCodes, flagAssetPath } = await import("../lib/flag-assets.ts");

test("every supported selector location has a bundled flag asset", async () => {
  await Promise.all(flagAssetCodes.map((code) => access(new URL(`../public/flags/${code}.svg`, import.meta.url))));
  assert.equal(flagAssetCodes.length, 57);
});

test("maps U.S., state, district, and territory flags to local paths", () => {
  assert.equal(flagAssetPath("us"), "/flags/us.svg");
  assert.equal(flagAssetPath("state", "VA"), "/flags/va.svg");
  assert.equal(flagAssetPath("state", "NE"), "/flags/ne.svg");
  assert.equal(flagAssetPath("state", "MN"), "/flags/mn.svg");
  assert.equal(flagAssetPath("state", "DC"), "/flags/dc.svg");
  assert.equal(flagAssetPath("state", "PR"), "/flags/pr.svg");
  assert.equal(flagAssetPath("state", "ZZ"), null);
});
