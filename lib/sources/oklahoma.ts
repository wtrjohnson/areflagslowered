import type { SourceSnapshot } from "../types.ts";
import type { ParsedJurisdictionStatus } from "./texas.ts";

export const OKLAHOMA_FULL_URL = "https://oklahoma.gov/governor/flag-status-full.html";
export const OKLAHOMA_HALF_URL = "https://oklahoma.gov/governor/flag-status-half.html";
export const OKLAHOMA_HOME_URL = "https://oklahoma.gov/governor.html";

function stripHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

export function parseOklahomaFlagStatus({ homeHtml, fullHtml, halfHtml, retrievedAt = new Date().toISOString() }: { homeHtml: string; fullHtml: string; halfHtml: string; retrievedAt?: string }): ParsedJurisdictionStatus {
  const homeText = stripHtml(homeHtml);
  const fullText = stripHtml(fullHtml);
  const halfText = stripHtml(halfHtml);
  const content = JSON.stringify({ home: homeHtml, full: fullHtml, half: halfHtml });
  const contentHash = `oklahoma-${homeText.length}-${fullText.length}-${halfText.length}-${homeText.slice(0, 32).replace(/\W/g, "")}`;
  const snapshot: SourceSnapshot = { id: `oklahoma-${contentHash}`, sourceId: "ok-flag-status", url: OKLAHOMA_HOME_URL, retrievedAt, contentHash, content, parserStatus: "changed" };

  // Both status pages remain available. The governor homepage's link is the
  // authoritative selector for which one is currently active.
  // The homepage can contain archived/encoded markup as well. Use the first
  // real href in the rendered page, which is the active navigation target.
  const activeLink = homeHtml.match(/href=["'][^"']*\/flag-status-(half|full)\.html["']/i)?.[1]?.toLowerCase();
  const half = activeLink === "half";
  const full = activeLink === "full";
  if (half === full) return { snapshot: { ...snapshot, parserStatus: "failed" }, status: "uncertain", flagTypes: ["us", "state"], needsReview: true };
  return { snapshot: { ...snapshot, parserStatus: "parsed" }, status: half ? "half_mast" : "full_mast", flagTypes: ["us", "state"], needsReview: false };
}
