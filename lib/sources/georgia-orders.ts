import { inflateRawSync } from "node:zlib";
import type { HalfMastOrder, SourceSnapshot } from "../types.ts";

export const GEORGIA_ORDERS_URL = "https://gov.georgia.gov/executive-action/executive-orders/2026";

function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }
function dateValue(value: string) { const parsed = new Date(`${value} 12:00:00 UTC`); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10); }

export function extractEmbeddedPdfText(pdf: Uint8Array) {
  const raw = new TextDecoder("latin1").decode(pdf);
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
    const bytes = new Uint8Array([...match[1]].map((char) => char.charCodeAt(0)));
    try { return new TextDecoder("latin1").decode(inflateRawSync(bytes)); } catch { return match[1]; }
  }).join(" ");
  const text = [...streams.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g)].map((match) => match[1].replace(/\\([\\()\\])/g, "$1"));
  text.push(...[...streams.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((match) => String.fromCharCode(...(match[1].match(/../g) || []).map((value) => Number.parseInt(value, 16))).replace(/[\0-\x1f]/g, " ")));
  return text.join(" ").replace(/\s+/g, " ").trim();
}

export function discoverGeorgiaFlagOrders(html: string, indexUrl = GEORGIA_ORDERS_URL) {
  return [...html.matchAll(/<tr>[\s\S]*?<a[^>]+href=["']([^"']+\/download[^"']*)["'][^>]*>[\s\S]*?<\/a>[\s\S]*?<td[^>]*field-document-description[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)]
    .filter((match) => /lowering flags|flags?[^<]{0,80}half[- ]staff/i.test(clean(match[2])))
    .map((match) => ({ url: new URL(match[1], indexUrl).toString(), title: clean(match[2].replace(/<[^>]+>/g, " ")) }));
}

export function parseGeorgiaFlagOrder({ text, url, title, retrievedAt = new Date().toISOString() }: { text: string; url: string; title: string; retrievedAt?: string }): (HalfMastOrder & { snapshot: SourceSnapshot }) | undefined {
  const content = clean(text);
  if (!/half[- ]staff/i.test(content)) return undefined;
  const searchable = `${content} ${clean(title)}`;
  const reason = searchable.match(/(?:in honor and memory of|in honor of|in memory of|in observance of)\s+([\s\S]{5,220}?)(?=\.|\s+It is|\s+This order|$)/i)?.[1]?.trim();
  const range = content.match(/half[- ]staff[^.]{0,180}?\b(?:on|from)\s+(?:[A-Z][a-z]+,\s+)?([A-Z][a-z]+ \d{1,2}, \d{4})(?:[^.]{0,120}?until\s+(?:sunset on |at )?([A-Z][a-z]+ \d{1,2}, \d{4}))?/i);
  const directiveDate = content.match(/([A-Z][a-z]+ \d{1,2}, \d{4})[^.]{0,180}?half[- ]staff/i)?.[1];
  const effectiveStart = dateValue(directiveDate || range?.[1] || "");
  const effectiveEnd = range?.[2] ? dateValue(range[2]) : effectiveStart;
  if (!reason || !effectiveStart || !effectiveEnd) return undefined;
  const contentHash = `ga-order-${content.length}-${content.slice(0, 64).replace(/\W/g, "")}`;
  const snapshot: SourceSnapshot = { id: contentHash, sourceId: "ga-executive-orders", url, retrievedAt, contentHash, content, parserStatus: "parsed" };
  return { id: `ga-${contentHash}`, title, reason, issuingAuthority: "The Governor of Georgia", jurisdiction: { id: "ga", name: "Georgia", stateCode: "GA", level: "state" }, flagTypes: ["us", "state"], scope: "statewide", instructionType: "order", instructionText: content, effectiveStart, effectiveEnd, effectiveEndCondition: "clock", timeZone: "America/New_York", sourceUrl: url, sourceSnapshotId: snapshot.id, status: "published", createdAt: retrievedAt, snapshot };
}
