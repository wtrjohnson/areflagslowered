import type { HalfMastOrder, Jurisdiction, SourceSnapshot } from "../types.ts";

export const WHITE_HOUSE_SEARCH_URL = "https://www.whitehouse.gov/presidential-actions/?s=half-staff";
export const federalJurisdiction: Jurisdiction = { id: "us", name: "United States", level: "federal" };

const candidateTerms = [/half[\u2010-\u2015 -]*staff/i, /half[\u2010-\u2015 -]*mast/i, /flag.{0,80}(?:flown|lowered).{0,80}half/i];

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8217;|&rsquo;/gi, "’")
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/â€‘|â€“|â€”/g, "-")
    .replace(/â€™/g, "’")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: string) {
  const parsed = new Date(`${value} UTC`);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString().slice(0, 10);
}

function normalizeClockTime(value?: string) {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/\s|\./g, "");
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (!match) return value;
  let hour = Number(match[1]);
  if (match[3] === "pm" && hour !== 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${match[2] || "00"}`;
}

function findEnd(text: string) {
  const match = text.match(/until\s+(?:sunset,?\s+)?(?:(\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|am|pm))\s+on\s+)?([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i)
    ?? text.match(/until\s+(noon|midnight)\s+(?:on\s+)?([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/i);
  if (!match) {
    const timeOnly = text.match(/until\s+(noon|midnight)/i);
    if (!timeOnly) return undefined;
    const before = text.slice(Math.max(0, timeOnly.index! - 1000), timeOnly.index);
    const dateMatch = [...before.matchAll(/([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/g)].at(-1);
    if (!dateMatch) return undefined;
    const date = parseDate(dateMatch[1]);
    if (!date) return undefined;
    return { date, time: timeOnly[1].toLowerCase() === "noon" ? "12:00" : "00:00", condition: timeOnly[1].toLowerCase() === "noon" ? "noon" : "midnight", text: timeOnly[0] };
  }
  const date = parseDate(match[2]);
  if (!date) return undefined;
  const time = match[1]?.toLowerCase() === "noon" ? "12:00" : match[1]?.toLowerCase() === "midnight" ? "00:00" : normalizeClockTime(match[1]);
  const condition = /sunset/i.test(match[0]) ? "sunset" : /noon/i.test(match[0]) ? "noon" : /midnight/i.test(match[0]) ? "midnight" : "clock";
  return { date, time, condition, text: match[0] };
}

function findPublicationDate(text: string) {
  const match = text.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/);
  return match ? parseDate(match[0]) : undefined;
}

function findEffectiveStart(text: string, fallback: string) {
  const flagIndex = text.search(/half[\u2010-\u2015 -]*(?:staff|mast)/i);
  const context = flagIndex >= 0 ? text.slice(Math.max(0, flagIndex - 1000), flagIndex) : text;
  const dates = [...context.matchAll(/([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/g)];
  const match = dates.at(-1);
  return match ? parseDate(match[1]) || fallback : fallback;
}

function findReason(text: string, title: string) {
  const opening = text.match(/((?:as a mark of respect|in honor of|to honor)[\s\S]{0,240}?)(?=,\s+i\s+(?:hereby|request|direct)\b)/i);
  if (opening?.[1]) return opening[1].trim();
  const match = text.match(/(?:as a mark of respect|in honor of|to honor)[^.]{0,360}\./i);
  return match?.[0].trim() || title.replace(/\s*[—–-]\s*/g, ": ");
}

export function discoverWhiteHouseLinks(html: string, baseUrl = "https://www.whitehouse.gov") {
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((match) => {
    try { return new URL(match[1], baseUrl).href.split("#")[0]; } catch { return undefined; }
  }).filter((href): href is string => Boolean(href));
  return [...new Set(links)].filter((href) => /whitehouse\.gov\/presidential-actions\/\d{4}\//.test(href));
}

export function isHalfStaffCandidate(html: string) {
  const text = stripHtml(html);
  return candidateTerms.some((term) => term.test(text));
}

export function parseWhiteHouseProclamation({ html, url, retrievedAt = new Date().toISOString() }: { html: string; url: string; retrievedAt?: string }): { snapshot: SourceSnapshot; order?: HalfMastOrder; needsReview: boolean; reason?: string } {
  const text = stripHtml(html);
  const title = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] && stripHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)![1])) || "White House presidential action";
  const publicationDate = findPublicationDate(text);
  const effectiveStart = publicationDate ? findEffectiveStart(text, publicationDate) : undefined;
  const end = findEnd(text);
  const hasInstruction = /(?:hereby order|request(?:s|ed)?|direct(?:s|ed)?).{0,360}(?:half[\u2010-\u2015 -]*staff|half[\u2010-\u2015 -]*mast)/i.test(text);
  const contentHash = `sha256-${text.length}-${text.slice(0, 32).replace(/\W/g, "")}`;
  const snapshot: SourceSnapshot = { id: `white-house-${contentHash}`, sourceId: "white-house-presidential-actions", url, retrievedAt, contentHash, content: html, parserStatus: hasInstruction && effectiveStart && end ? "parsed" : "changed" };
  if (!effectiveStart || !end || !hasInstruction) {
    return { snapshot, needsReview: true, reason: !publicationDate ? "Publication date not found." : !end ? "A clear effective end was not found." : "No clear half-staff instruction was found." };
  }
  const instructionType = /\brequest(?:ed|s)?\b/i.test(text) && !/\bhereby order\b/i.test(text) ? "request" : /\bhereby order\b|\bshall be flown\b/i.test(text) ? "order" : "unknown";
  const instructionText = text.slice(Math.max(0, text.search(/(?:hereby order|request|direct).{0,500}(?:half[\u2010-\u2015 -]*staff|half[\u2010-\u2015 -]*mast)/i)), Math.min(text.length, text.search(/(?:hereby order|request|direct).{0,500}(?:half[\u2010-\u2015 -]*staff|half[\u2010-\u2015 -]*mast)/i) + 700));
  const order: HalfMastOrder = {
    id: `white-house-${url.split("/").filter(Boolean).at(-1)}`,
    title,
    reason: findReason(text, title),
    issuingAuthority: "The President of the United States",
    jurisdiction: federalJurisdiction,
    flagTypes: ["us"],
    scope: "nationwide",
    instructionType,
    instructionText,
    effectiveStart,
    effectiveEnd: end.date,
    effectiveEndTime: end.time,
    effectiveEndCondition: end.condition,
    timeZone: "local",
    sourceUrl: url,
    sourceSnapshotId: snapshot.id,
    status: instructionType === "unknown" ? "needs_review" : "published",
    createdAt: retrievedAt,
  };
  return { snapshot, order, needsReview: order.status === "needs_review" };
}

export async function fetchWhiteHouseDocument(url: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(url, { headers: { "user-agent": "AreFlagsLowered/0.1 (+source-monitoring)" } });
  if (!response.ok) throw new Error(`White House returned ${response.status} for ${url}`);
  return response.text();
}
