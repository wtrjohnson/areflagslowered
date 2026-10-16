const stateAndTerritoryCodes = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc", "as", "gu", "mp", "pr", "vi",
]);

export const flagAssetCodes = ["us", ...stateAndTerritoryCodes] as const;

export function flagAssetPath(kind: "us" | "state", stateCode?: string) {
  if (kind === "us") return "/flags/us.svg";
  const code = stateCode?.toLowerCase();
  return code && stateAndTerritoryCodes.has(code) ? `/flags/${code}.svg` : null;
}
