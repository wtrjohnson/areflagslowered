import type { SourceSnapshot } from "../types.ts";
import type { ParsedJurisdictionStatus } from "./texas.ts";

export type StateStatusPattern = {
  full: RegExp;
  half: RegExp;
};

function stripHtml(html: string) {
  return html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

export function parseStateStatusPage({ html, sourceId, url, pattern, retrievedAt = new Date().toISOString() }: { html: string; sourceId: string; url: string; pattern: StateStatusPattern; retrievedAt?: string }): ParsedJurisdictionStatus {
  const text = stripHtml(html);
  const contentHash = `${sourceId}-${text.length}-${text.slice(0, 48).replace(/\W/g, "")}`;
  const base: SourceSnapshot = { id: `${sourceId}-${contentHash}`, sourceId, url, retrievedAt, contentHash, content: html, parserStatus: "changed" };
  const status = pattern.full.test(text) ? "full_mast" : pattern.half.test(text) ? "half_mast" : undefined;
  if (!status) return { snapshot: { ...base, parserStatus: "failed" }, status: "uncertain", flagTypes: ["us", "state"], needsReview: true };
  return { snapshot: { ...base, parserStatus: "parsed" }, status, flagTypes: ["us", "state"], needsReview: false };
}

export const stateStatusPatterns: Record<string, StateStatusPattern> = {
  "fl-flag-information": { full: /Flag Status:\s*Full Staff/i, half: /Flag Status:\s*Half Staff/i },
  "pa-flag-notices": { full: /United States Flag[\s\S]{0,120}Full-Staff[\s\S]{0,240}Commonwealth Flag[\s\S]{0,120}Full-Staff/i, half: /United States Flag[\s\S]{0,120}Half-Staff|Commonwealth Flag[\s\S]{0,120}Half-Staff/i },
  "nj-flag-status": { full: /All Flags Full-Staff/i, half: /All Flags Half-Staff/i },
  "ma-flag-status": { full: /Flags are flying at full staff/i, half: /flags? (?:are|will be|to be)[\s\S]{0,100}half-staff/i },
  "wa-flag-lowering": { full: /Flag Status\s*-\s*Full staff/i, half: /Flag Status\s*-\s*Half staff/i },
};
