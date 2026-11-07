const DEFAULT_SITE_ORIGIN = "https://are-flags-lowered.kvex.chatgpt.site";

export function siteOrigin() {
  let configured: string | undefined;
  try {
    configured = typeof process !== "undefined" ? process.env.ARE_FLAGS_LOWERED_URL : undefined;
  } catch {
    // The Worker runtime can expose configuration without a Node process shim.
  }
  const candidate = (configured || DEFAULT_SITE_ORIGIN).trim();
  const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}
