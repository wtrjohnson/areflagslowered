import type { HalfMastOrder, SourceSnapshot } from "../types.ts";
import { normalizeClockTime, solarTime } from "../timing.ts";

export const OKLAHOMA_NEWSROOM_URL = "https://oklahoma.gov/governor/newsroom/newsroom.html";
export const OKLAHOMA_NEWSROOM_FEED_URL = "https://oklahoma.gov/content/sok-wcm/en/governor/newsroom/newsroom/jcr:content/responsivegrid-second/newslisting.json?page=1";

function clean(value: string) { return value.replace(/&lt;|&#60;/gi, "<").replace(/&gt;|&#62;/gi, ">").replace(/&quot;|&#34;/gi, '"').replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\\r?\\n/g, " ").replace(/\s+/g, " ").trim(); }
function dateValue(month: string, day: string, year: string) { const d = new Date(`${month} ${day}, ${year} 12:00:00 UTC`); return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10); }
function normalizedDate(value?: string) { const match = value?.match(/^([A-Za-z]+) ([0-9]{1,2}), ([0-9]{4})$/); return match ? dateValue(match[1], match[2], match[3]) : undefined; }

export function discoverOklahomaFlagReleases(html: string) {
  try {
    const items = JSON.parse(html).items || [];
    return items.filter((item: { title?: string }) => /flag|half[- ]staff|lowered/i.test(item.title || "")).map((item: { newsUrl: string }) => new URL(item.newsUrl, OKLAHOMA_NEWSROOM_URL).toString());
  } catch { return [...html.matchAll(/href=["']([^"']*(?:flags?|flag)[^"']*half[- ]staff[^"']*)["']/gi)].map((m) => new URL(m[1], OKLAHOMA_NEWSROOM_URL).toString()); }
}

export function parseOklahomaFlagRelease({ html, url, retrievedAt = new Date().toISOString() }: { html: string; url: string; retrievedAt?: string }): (HalfMastOrder & { snapshot: SourceSnapshot }) | undefined {
  const text = clean(html);
  const title = clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "Oklahoma flags at half-staff");
  const bodyStart = [text.indexOf("has directed"), text.indexOf("has ordered"), text.indexOf("has issued"), text.indexOf("issued Executive Order"), text.indexOf("issued an order")].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const reasonStart = text.slice(bodyStart).match(/(?:in honor of|in remembrance of|to honor|to remember)\s+/i);
  const reasonRemainder = reasonStart ? text.slice(bodyStart + reasonStart.index! + reasonStart[0].length) : "";
  const reasonStop = reasonRemainder.search(/\.\s*(?:Flags|After|The|It is|Oklahoma|["“])/i);
  const reason = reasonStart ? (reasonStop >= 0 ? reasonRemainder.slice(0, reasonStop) : reasonRemainder.split(".")[0]).trim() : undefined;
  const sourceYear = new Date(retrievedAt).getUTCFullYear();
  const halfStaffIndices = [...text.matchAll(/half-staff/gi)].map((match) => match.index!);
  const directiveIndex = halfStaffIndices.map((index) => {
    const datesNearFlag = [...text.slice(index, index + 320).matchAll(/([A-Za-z]+\s+\d{1,2},\s+20\d{2})/g)].map((match) => match[1]).filter((date) => date.endsWith(String(sourceYear)));
    return { index, date: datesNearFlag.sort().at(-1) };
  }).filter((candidate) => candidate.date).sort((a, b) => a.date!.localeCompare(b.date!)).at(-1)?.index;
  const directiveText = text.slice(directiveIndex ?? 0);
  const schedule = directiveText.match(/\bfrom\s+[\s\S]*/i)?.[0] || directiveText.match(/\bon\s+(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+)?[A-Za-z]+\s+\d{1,2},\s+\d{4}[\s\S]*/i)?.[0] || "";
  const dates = [...schedule.matchAll(/([A-Za-z]+ \d{1,2}, \d{4})/g)].map((match) => match[1]).filter((date) => date.endsWith(String(sourceYear)));
  if (!/\bfrom\b/i.test(schedule)) {
    const singleDayDates = [...text.matchAll(/([A-Za-z]+ \d{1,2}, \d{4})/g)].map((match) => match[1]).filter((date) => date.endsWith(String(sourceYear)));
    if (singleDayDates.length) dates.splice(0, dates.length, singleDayDates.at(-1)!);
  }
  const singleDayDirectiveDate = text.match(/\bon\s+(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+)?([A-Za-z]+\s+\d{1,2},\s+\d{4})[^.]{0,100}?\bin\s+(?:remembrance|honor|memory)\b/i)?.[1];
  if (singleDayDirectiveDate) dates.splice(0, dates.length, singleDayDirectiveDate);
  const period = dates.length >= 1 ? ["", dates[0], dates[1] || dates[0]] : undefined;
  const effectiveStart = normalizedDate(period?.[1]);
  const effectiveEnd = normalizedDate(period?.[2]);
  if (!reason || !effectiveStart || !effectiveEnd) return undefined;
  const effectiveStartTime = /sunrise/i.test(schedule) ? solarTime(effectiveStart, "sunrise", "America/Chicago", "OK") : normalizeClockTime(schedule.match(/(?:from|at|beginning)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|am|pm))/i)?.[1]);
  const effectiveEndTime = /sunrise/i.test(schedule) ? solarTime(effectiveEnd, "sunrise", "America/Chicago", "OK") : /sunset|sundown/i.test(schedule) ? solarTime(effectiveEnd, "sunset", "America/Chicago", "OK") : normalizeClockTime(schedule.match(/(?:until|through|to)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|am|pm))/i)?.[1]);
  const contentHash = `ok-news-${text.length}-${text.slice(0, 48).replace(/\W/g, "")}`;
  const snapshot: SourceSnapshot = { id: contentHash, sourceId: "ok-newsroom", url, retrievedAt, contentHash, content: html, parserStatus: "parsed" };
  const completeTiming = Boolean(effectiveStartTime && effectiveEndTime);
  return { id: `oklahoma-${contentHash}`, title, reason, issuingAuthority: "The Governor of Oklahoma", jurisdiction: { id: "ok", name: "Oklahoma", stateCode: "OK", level: "state" }, flagTypes: ["us", "state"], scope: "statewide", instructionType: "order", instructionText: text, effectiveStart, effectiveStartTime, effectiveEnd, effectiveEndTime, effectiveEndCondition: /sunrise/i.test(schedule) ? "sunrise" : /sunset|sundown/i.test(schedule) ? "sunset" : "clock", timeZone: "America/Chicago", sourceUrl: url, sourceSnapshotId: snapshot.id, status: completeTiming ? "published" : "needs_review", createdAt: retrievedAt, snapshot };
}
