import test from "node:test";
import assert from "node:assert/strict";

const { jurisdictionByCode, jurisdictionBySlug, jurisdictionCatalog, reservedJurisdictionSlugs } = await import("../lib/jurisdictions.ts");
const { createShareToken, previewAltText, previewTitle, validShareToken } = await import("../lib/share-preview-core.ts");
const { previewFlagPresentation, previewGeometry } = await import("../lib/preview-image.ts");

test("every jurisdiction has a unique canonical slug and flag asset", () => {
  assert.equal(new Set(jurisdictionCatalog.map((value) => value.slug)).size, jurisdictionCatalog.length);
  for (const jurisdiction of jurisdictionCatalog) {
    assert.equal(jurisdictionBySlug(jurisdiction.slug)?.id, jurisdiction.id);
    assert.equal(jurisdictionByCode(jurisdiction.stateCode)?.id, jurisdiction.id);
    assert.equal(jurisdiction.flagAsset, `/flags/${jurisdiction.id}.svg`);
  }
  assert.equal(jurisdictionBySlug("south-carolina")?.stateCode, "SC");
  assert.equal(jurisdictionBySlug("district-of-columbia")?.stateCode, "DC");
  assert.equal(jurisdictionBySlug("not-a-state"), undefined);
  assert.equal(reservedJurisdictionSlugs.has("api"), true);
});

test("share tokens are opaque 128-bit base64url values", () => {
  const first = createShareToken();
  const second = createShareToken();
  assert.equal(validShareToken(first), true);
  assert.equal(first.length, 22);
  assert.notEqual(first, second);
  assert.equal(validShareToken("afe-order-123"), false);
  assert.equal(validShareToken(`${first}x`), false);
});

test("preview geometry defines exact full, half, below-US, and uncertain positions", () => {
  assert.deepEqual(previewFlagPresentation("full_mast"), { offset: 0, opacity: 1 });
  assert.deepEqual(previewFlagPresentation("below_us"), { offset: 0, opacity: 1 });
  assert.deepEqual(previewFlagPresentation("uncertain"), { offset: 63, opacity: 0.45 });
  assert.equal(previewFlagPresentation("half_mast").offset, (previewGeometry.poleHeight - previewGeometry.flagHeight) / 2);
  assert.equal(previewGeometry.width, 1200);
  assert.equal(previewGeometry.height, 630);
});

test("preview alt text describes both immutable flag positions", () => {
  const jurisdiction = jurisdictionBySlug("south-carolina");
  assert.equal(previewAltText(jurisdiction, "full_mast", "half_mast"), "U.S. flag at full mast and South Carolina flag at half-mast.");
});

test("preview title states the most useful mast status", () => {
  const jurisdiction = jurisdictionBySlug("south-carolina");
  assert.equal(previewTitle(jurisdiction, "full_mast", "half_mast"), "South Carolina flag at half-mast");
  assert.equal(previewTitle(jurisdiction, "half_mast", "half_mast"), "U.S. and South Carolina flags at half-mast");
  assert.equal(previewTitle(jurisdiction, "full_mast", "full_mast"), "South Carolina flag at full mast");
  assert.equal(previewTitle(jurisdiction, "full_mast", "uncertain"), "South Carolina flag status needs review");
});
