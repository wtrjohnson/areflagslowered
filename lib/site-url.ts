const DEFAULT_SITE_ORIGIN = "https://are-flags-lowered.kvex.chatgpt.site";

export function siteOrigin() {
  return (process.env.ARE_FLAGS_LOWERED_URL || DEFAULT_SITE_ORIGIN).replace(/\/$/, "");
}
