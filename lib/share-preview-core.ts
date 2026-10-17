import type { JurisdictionDefinition } from "./jurisdictions.ts";
import type { FlagResult } from "./types.ts";

export type PreviewStatus = FlagResult["status"];
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function validShareToken(value: string) {
  return SHARE_TOKEN_PATTERN.test(value);
}

export function previewImageUrl(origin: string, jurisdictionSlug: string, share?: string) {
  const params = new URLSearchParams({ v: "2" });
  if (share) params.set("share", share);
  return `${origin}/api/share-image/${jurisdictionSlug}.png?${params}`;
}

export function createShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function previewAltText(jurisdiction: JurisdictionDefinition, usStatus: PreviewStatus, stateStatus: PreviewStatus) {
  const label = (status: PreviewStatus) => status === "half_mast" ? "at half-mast" : status === "uncertain" ? "with position uncertain" : status === "below_us" ? "at full mast in the below-U.S. display position" : "at full mast";
  return `U.S. flag ${label(usStatus)} and ${jurisdiction.name} flag ${label(stateStatus)}.`;
}

/** A concise, status-led title for social link cards. */
export function previewTitle(jurisdiction: JurisdictionDefinition, usStatus: PreviewStatus, stateStatus: PreviewStatus) {
  if (usStatus === "uncertain" || stateStatus === "uncertain") {
    return `${jurisdiction.name} flag status needs review`;
  }
  if (usStatus === "half_mast" && stateStatus === "half_mast") {
    return `U.S. and ${jurisdiction.name} flags at half-mast`;
  }
  if (stateStatus === "half_mast") {
    return `${jurisdiction.name} flag at half-mast`;
  }
  if (usStatus === "half_mast") {
    return `U.S. flag at half-mast — ${jurisdiction.name}`;
  }
  return `${jurisdiction.name} flag at full mast`;
}
