import type { InboundEmail } from "./afe-email.ts";

export type OfficialSource = {
  url?: string;
  title?: string;
  publisher?: string;
  publishedAt?: string;
  status: "verified" | "not_available" | "needs_review";
};

type Candidate = { url: string; title?: string };

function cleanUrl(value: string) {
  try {
    const url = new URL(value.replace(/[),.;]+$/, ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch { return undefined; }
}

function candidateLinks(email: InboundEmail): Candidate[] {
  const candidates: Candidate[] = [];
  for (const match of email.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = cleanUrl(match[1]);
    if (url) candidates.push({ url, title: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || undefined });
  }
  for (const match of [email.plainText, email.html].join("\n").matchAll(/https?:\/\/[^\s<>"]+/gi)) {
    const url = cleanUrl(match[0]);
    if (url) candidates.push({ url });
  }
  return [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()];
}

function isOfficial(url: string) {
  const host = new URL(url).hostname.toLowerCase();
  return host === "whitehouse.gov" || host.endsWith(".whitehouse.gov") || host.endsWith(".gov") || host.endsWith(".mil");
}

function score(candidate: Candidate) {
  const text = `${candidate.url} ${candidate.title || ""}`.toLowerCase();
  return (isOfficial(candidate.url) ? 100 : 0) + (/proclamation|executive[- ]?order|half[- ]?(staff|mast)|\.pdf(?:$|\?)/.test(text) ? 20 : 0) + (/whitehouse\.gov/.test(text) ? 5 : 0);
}

function publishedAt(email: InboundEmail) {
  const value = email.headers.date;
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Select only a government document; a non-government destination always needs human review. */
export function selectOfficialSource(email: InboundEmail): OfficialSource {
  const links = candidateLinks(email).filter((link) => !/flagsexpress\.com/i.test(link.url));
  const official = links.filter((link) => isOfficial(link.url)).sort((a, b) => score(b) - score(a))[0];
  if (official) {
    const hostname = new URL(official.url).hostname.replace(/^www\./, "");
    return { url: official.url, title: official.title, publisher: hostname, publishedAt: publishedAt(email), status: "verified" };
  }
  // Footer and social links are not evidence. A link that is labelled as an
  // order/proclamation, however, is held for review if it is not governmental.
  const possibleOrderLink = links.some((link) => /proclamation|\border\b|official|governor|half[- ]?(staff|mast)/i.test(`${link.title || ""} ${link.url}`));
  if (possibleOrderLink) return { status: "needs_review", publishedAt: publishedAt(email) };
  return { status: "not_available", publishedAt: publishedAt(email) };
}
