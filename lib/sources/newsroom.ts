import type { HalfMastOrder, SourceSnapshot } from "../types.ts";

export type NewsroomSource = {
  sourceId: string;
  jurisdictionId: string;
  jurisdictionName: string;
  stateCode: string;
  authority: string;
  indexUrl: string;
  timeZone: string;
};

function clean(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
}

function dateValue(value: string, fallbackYear?: string) {
  const normalized = /, \d{4}$/.test(value) ? value : `${value}, ${fallbackYear || new Date().getUTCFullYear()}`;
  const parsed = new Date(`${normalized} 12:00:00 UTC`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function dates(text: string, fallbackYear?: string) {
  return [...text.matchAll(/\b([A-Z][a-z]+ \d{1,2}(?:, \d{4})?)\b/g)].map((match) => dateValue(match[1], fallbackYear)).filter((value): value is string => Boolean(value));
}

export function discoverNewsroomReleases(html: string, indexUrl: string) {
  const links = [...html.matchAll(/href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .filter((match) => /flag|half[- ]staff|lowered|lowering/i.test(`${match[1]} ${clean(match[2])}`))
    .map((match) => new URL(match[1], indexUrl).toString());
  return [...new Set(links)];
}

export function parseNewsroomRelease({ html, url, source, retrievedAt = new Date().toISOString() }: { html: string; url: string; source: NewsroomSource; retrievedAt?: string }): (HalfMastOrder & { snapshot: SourceSnapshot }) | undefined {
  const text = clean(html);
  if (!/half[- ]staff|half[- ]mast|lowered|lowering/i.test(text)) return undefined;
  const title = clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || `${source.jurisdictionName} flag order`);
  const reason = text.match(/(?:in honor of|to honor|in memory of|to remember|in mourning for|in observance of)\s+([\s\S]{8,280}?)(?=(?:,?\s+(?:who|which|that)\b|\.|;|\s+Flags?\s|\s+all flags?\s|$))/i)?.[1]?.trim(); 
  const publicationYear = text.match(/\b[A-Z][a-z]{2} \d{1,2}, (\d{4})\b\s*[·-]\s*Office of the Governor/i)?.[1];
  const period = text.match(/(?:from|beginning|starting|effective|on)\s+(?:sunrise|sunset)?(?:\s+on)?\s*([A-Z][a-z]+ \d{1,2}(?:, \d{4})?)[\s\S]{0,180}?(?:lasting through|until|through|to|and remain(?: at half[- ]staff)? until)\s+(?:(?:sunset|sunrise|sundown)(?:\s+on|\s+of)?\s+)?([A-Z][a-z]+ \d{1,2}(?:, \d{4})?)/i);
  const singleDay = text.match(/from\s+(?:sunrise|sunset)\s+to\s+(?:sunset|sunrise)\s+on\s+(?:[A-Z][a-z]+,\s+)?([A-Z][a-z]+ \d{1,2}(?:, \d{4})?)/i);
  const foundDates = dates(period?.[0] || singleDay?.[0] || text, publicationYear);
  const effectiveStart = period ? dateValue(period[1], publicationYear) : singleDay ? dateValue(singleDay[1], publicationYear) : foundDates[0];
  const effectiveEnd = period ? dateValue(period[2], publicationYear) : singleDay ? effectiveStart : foundDates[1];
  if (!reason || !effectiveStart) return undefined;
  const contentHash = `${source.sourceId}-${text.length}-${text.slice(0, 80).replace(/\W/g, "")}`;
  const snapshot: SourceSnapshot = { id: contentHash, sourceId: source.sourceId, url, retrievedAt, contentHash, content: html, parserStatus: effectiveEnd ? "parsed" : "changed" };
  return {
    id: `${source.jurisdictionId}-${contentHash}`,
    title,
    reason,
    issuingAuthority: source.authority,
    jurisdiction: { id: source.jurisdictionId, name: source.jurisdictionName, stateCode: source.stateCode, level: "state" },
    flagTypes: ["us", "state"],
    scope: "statewide",
    instructionType: "order",
    instructionText: text,
    effectiveStart,
    effectiveEnd,
    effectiveEndCondition: /sunset/i.test(period?.[0] || text) ? "sunset" : "clock",
    timeZone: source.timeZone as HalfMastOrder["timeZone"],
    sourceUrl: url,
    sourceSnapshotId: snapshot.id,
    status: effectiveEnd ? "published" : "needs_review",
    createdAt: retrievedAt,
    snapshot,
  };
}
