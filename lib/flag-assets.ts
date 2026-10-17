import { jurisdictionByCode, jurisdictionCatalog } from "./jurisdictions.ts";

export const flagAssetCodes = ["us", ...jurisdictionCatalog.map((jurisdiction) => jurisdiction.id)] as const;

export function flagAssetPath(kind: "us" | "state", stateCode?: string) {
  if (kind === "us") return "/flags/us.svg";
  return stateCode ? jurisdictionByCode(stateCode)?.flagAsset || null : null;
}
