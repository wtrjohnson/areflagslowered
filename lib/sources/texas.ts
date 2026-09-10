import type { SourceSnapshot } from "../types.ts";

export const TEXAS_FLAG_STATUS_URL = "https://gov.texas.gov/flag-status";

export type ParsedJurisdictionStatus = {
  snapshot: SourceSnapshot;
  status: "half_mast" | "full_mast" | "uncertain";
  flagTypes: ["us", "state"];
  reason?: string;
  needsReview: boolean;
};

function stripHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

export function parseTexasFlagStatus({ html, url = TEXAS_FLAG_STATUS_URL, retrievedAt = new Date().toISOString() }: { html: string; url?: string; retrievedAt?: string }): ParsedJurisdictionStatus {
  const text = stripHtml(html);
  const contentHash = `texas-${text.length}-${text.slice(0, 48).replace(/\W/g, "")}`;
  const snapshot: SourceSnapshot = { id: `texas-${contentHash}`, sourceId: "tx-flag-status", url, retrievedAt, contentHash, content: html, parserStatus: "changed" };
  const statusMatch = text.match(/Flag Status:\s*(Full-Staff|Half-Staff)/i) || text.match(/Texas flag is at\s+(full|half)-staff/i);
  if (!statusMatch) return { snapshot: { ...snapshot, parserStatus: "failed" }, status: "uncertain", flagTypes: ["us", "state"], needsReview: true };
  const status = /half/i.test(statusMatch[1]) ? "half_mast" : "full_mast";
  const reason = status === "half_mast" ? text.match(/(?:in honor of|in memory of|to honor)[^.]{0,240}/i)?.[0]?.trim() : undefined;
  return { snapshot: { ...snapshot, parserStatus: "parsed" }, status, flagTypes: ["us", "state"], reason, needsReview: false };
}
