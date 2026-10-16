import { and, eq, or } from "drizzle-orm";
import { getDb } from "../db/index.ts";
import { inboundEmails, orders, sources, sourceSnapshots } from "../db/schema.ts";
import { upsertJurisdiction, upsertOrder, upsertSource } from "../db/orders.ts";
import { jurisdictionCatalog, federalJurisdiction } from "./jurisdictions.ts";
import { emailText, hashText, parseInboundEmail, type InboundEmail } from "./afe-email.ts";
import { extractAfeEmail, summarizeAfeReason, validateAfeExtraction, type AfeExtraction } from "./afe-extractor.ts";
import { notifyInboundIssue } from "./monitoring.ts";

const AFE_SOURCE_ID = "american-flags-express-email";
const AFE_SOURCE_URL = process.env.AFE_SOURCE_URL || "https://flagsexpress.com";
const AFE_TRUSTED_FORWARDERS = (process.env.AFE_TRUSTED_FORWARDERS || process.env.AFE_FORWARDER_EMAIL || "w@williamj.us")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

function stateFor(extraction: AfeExtraction) {
  if (extraction.geographicScope === "nationwide") return federalJurisdiction;
  const found = jurisdictionCatalog.find((item) => item.stateCode === extraction.stateCode);
  if (!found) throw new Error(`Unsupported state code: ${extraction.stateCode || "missing"}.`);
  return found;
}

function orderId(email: InboundEmail, extraction: AfeExtraction) {
  const key = extraction.externalId || [extraction.effectiveStart, extraction.stateCode, extraction.countyName, extraction.reason, extraction.flagTypes.sort().join(",")].join("|");
  return `afe-${hashText(key).slice(0, 24)}`;
}

function normalized(value: string | null | undefined) {
  return (value || "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function sameFlags(left: string[], right: string[]) {
  return left.length === right.length && left.every((flag) => right.includes(flag));
}

type CanonicalCandidate = { scope: string; flagTypes: unknown; effectiveStart: string; issuingAuthority: string; title: string; reason: string };

/** A revision is automatic only when one existing AFE order satisfies every strong signal. */
export function selectStrongCanonicalOrder<T extends CanonicalCandidate>(candidates: T[], extraction: AfeExtraction) {
  const requiredNames = extraction.namedEntities.map(normalized).filter(Boolean);
  const expectedScope = extraction.geographicScope === "nationwide" ? "nationwide" : "statewide";
  const matches = candidates.filter((candidate) => {
    if (candidate.scope !== expectedScope || !sameFlags(candidate.flagTypes as string[], extraction.flagTypes)) return false;
    if (extraction.effectiveStart && candidate.effectiveStart !== extraction.effectiveStart) return false;
    if (normalized(candidate.issuingAuthority) !== normalized(extraction.issuingAuthority)) return false;
    const candidateText = normalized(`${candidate.title} ${candidate.reason}`);
    return requiredNames.length > 0
      ? requiredNames.every((name) => candidateText.includes(name))
      : normalized(candidate.title) === normalized(extraction.title) && normalized(extraction.title).length > 5;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

async function findCanonicalOrder(db: ReturnType<typeof getDb>, extraction: AfeExtraction) {
  if (extraction.externalId) {
    const id = `afe-${hashText(extraction.externalId).slice(0, 24)}`;
    return (await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.status, "published"))))[0];
  }
  if (extraction.geographicScope !== "nationwide" && !extraction.stateCode) return undefined;
  const jurisdiction = extraction.geographicScope === "nationwide" ? federalJurisdiction : jurisdictionCatalog.find((item) => item.stateCode === extraction.stateCode);
  if (!jurisdiction) return undefined;
  const candidateRows = await db.select({ order: orders }).from(orders)
    .innerJoin(sourceSnapshots, eq(orders.sourceSnapshotId, sourceSnapshots.id))
    .innerJoin(sources, eq(sourceSnapshots.sourceId, sources.id))
    .where(and(
      eq(orders.jurisdictionId, jurisdiction.id),
      eq(orders.status, "published"),
      eq(sources.id, AFE_SOURCE_ID),
    ));
  const candidates = candidateRows.map((row) => row.order);
  return selectStrongCanonicalOrder(candidates, extraction);
}

function publicScope(extraction: AfeExtraction) {
  return extraction.geographicScope === "nationwide" || extraction.geographicScope === "statewide";
}

export function validateAfeSender(email: InboundEmail) {
  const text = emailText(email);
  const isDirectAfeMessage = /@flagsexpress\.com\b/i.test(email.sender);
  const isForwardedAfeMessage = /@flagsexpress\.com\b/i.test(text) && /American Flags Express/i.test(text);
  const isHalfStaffAlert = /\bHalf-Staff Alert\b/i.test(email.subject) || /\bHalf-Staff Alert\b/i.test(text);
  const senderAddress = email.sender.match(/<([^>]+)>/)?.[1] || email.sender.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] || "";
  const isTrustedForwarder = AFE_TRUSTED_FORWARDERS.includes(senderAddress.trim().toLowerCase());
  return (isDirectAfeMessage || isForwardedAfeMessage || isTrustedForwarder) && isHalfStaffAlert;
}

export async function ingestAfeEmail(rawEmail: string, options: { providerMessageId?: string; receivedAt?: Date; apiKey?: string; model?: string } = {}) {
  const email = parseInboundEmail(rawEmail);
  if (!validateAfeSender(email)) throw new Error("Inbound email is not an American Flags Express alert.");
  const db = getDb();
  await upsertSource(db, { id: AFE_SOURCE_ID, jurisdictionId: "us", name: "American Flags Express email alerts", url: AFE_SOURCE_URL, sourceType: "email", parserName: "american_flags_express_llm", priority: "primary", timeZone: "America/New_York", pollIntervalMinutes: 0 });
  const existing = await db.select().from(inboundEmails).where(or(eq(inboundEmails.contentHash, email.contentHash), email.messageId ? eq(inboundEmails.providerMessageId, options.providerMessageId || email.messageId) : eq(inboundEmails.contentHash, email.contentHash)));
  if (existing[0]) return { status: existing[0].processingStatus, id: existing[0].id, duplicate: true };
  const id = `inbound-${email.contentHash.slice(0, 24)}`;
  await db.insert(inboundEmails).values({ id, providerMessageId: options.providerMessageId || email.messageId || null, contentHash: email.contentHash, sender: email.sender, recipient: email.recipient, subject: email.subject, receivedAt: options.receivedAt || new Date(), rawEmail, processingStatus: "received" });
  try {
    const extraction = await extractAfeEmail(email, options.apiKey, options.model);
    validateAfeExtraction(extraction);
    const reasonSummary = await summarizeAfeReason(extraction.reason, extraction.namedEntities, options.apiKey, options.model);
    const snapshotId = `afe-snapshot-${email.contentHash.slice(0, 24)}`;
    await db.insert(sourceSnapshots).values({ id: snapshotId, sourceId: AFE_SOURCE_ID, url: AFE_SOURCE_URL, retrievedAt: options.receivedAt || new Date(), contentHash: email.contentHash, content: rawEmail, parserStatus: "parsed" }).onConflictDoNothing();
    if (extraction.geographicScope === "municipal" || extraction.geographicScope === "county") {
      await db.update(inboundEmails).set({ extractedJson: { ...extraction, reasonSummary }, processingStatus: "local_only" }).where(eq(inboundEmails.id, id));
      return { status: "local_only", id, duplicate: false };
    }
    const supported = publicScope(extraction);
    const matchedOrder = supported ? await findCanonicalOrder(db, extraction) : undefined;
    if (extraction.alertType === "cancellation") {
      if (!matchedOrder) throw new Error("Cancellation could not be matched to exactly one active order.");
      await db.update(orders).set({ status: "rejected", updatedAt: new Date() }).where(eq(orders.id, matchedOrder.id));
      await db.update(inboundEmails).set({ extractedJson: { ...extraction, reasonSummary }, processingStatus: "cancelled", orderId: matchedOrder.id }).where(eq(inboundEmails.id, id));
      return { status: "cancelled", id, orderId: matchedOrder.id, duplicate: false };
    }
    if (supported && extraction.effectiveStart) {
      const jurisdiction = stateFor(extraction);
      const idForOrder = matchedOrder?.id || orderId(email, extraction);
      await upsertJurisdiction(db, jurisdiction);
      await upsertOrder(db, { id: idForOrder, title: extraction.title || email.subject, reason: reasonSummary, issuingAuthority: extraction.issuingAuthority, jurisdiction, flagTypes: extraction.flagTypes, scope: extraction.geographicScope === "nationwide" ? "nationwide" : "statewide", instructionType: "order", instructionText: extraction.instructionText, effectiveStart: extraction.effectiveStart, effectiveStartTime: extraction.effectiveStartTime || undefined, effectiveEnd: extraction.effectiveEnd || undefined, effectiveEndTime: extraction.effectiveEndTime || undefined, effectiveEndCondition: extraction.effectiveEndCondition || undefined, timeZone: extraction.timeZone || undefined, sourceUrl: AFE_SOURCE_URL, sourceSnapshotId: snapshotId, status: extraction.alertType === "cancellation" ? "rejected" : "published", createdAt: (options.receivedAt || new Date()).toISOString(), alertType: extraction.alertType, geographicScope: extraction.geographicScope, sourceMessageId: email.messageId || options.providerMessageId });
      const processingStatus = matchedOrder ? "updated" : "published";
      await db.update(inboundEmails).set({ extractedJson: { ...extraction, reasonSummary }, processingStatus, orderId: idForOrder }).where(eq(inboundEmails.id, id));
      return { status: processingStatus, id, orderId: idForOrder, duplicate: false };
    }
    const error = supported ? "Correction or revision could not be matched to exactly one active order." : "The alert scope is not supported by the public status model.";
    await db.update(inboundEmails).set({ extractedJson: extraction, processingStatus: "quarantined", error }).where(eq(inboundEmails.id, id));
    await notifyInboundIssue("inbound alert needs review", `${email.subject}\n${error}`);
    return { status: "quarantined", id, duplicate: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(inboundEmails).set({ processingStatus: "quarantined", error: message }).where(eq(inboundEmails.id, id));
    throw error;
  }
}

export async function approveAfeInboundEmail(id: string, canonicalOrderId?: string) {
  const db = getDb();
  const row = (await db.select().from(inboundEmails).where(eq(inboundEmails.id, id)))[0];
  if (!row?.extractedJson) throw new Error("No extracted candidate is available for this inbound email.");
  const extraction = row.extractedJson as AfeExtraction;
  validateAfeExtraction(extraction);
  if (extraction.geographicScope !== "nationwide" && extraction.geographicScope !== "statewide") throw new Error("Only nationwide and statewide orders can be approved in v1.");
  const email = parseInboundEmail(row.rawEmail);
  const jurisdiction = stateFor(extraction);
  const snapshotId = `afe-snapshot-${row.contentHash.slice(0, 24)}`;
  await db.insert(sourceSnapshots).values({ id: snapshotId, sourceId: AFE_SOURCE_ID, url: AFE_SOURCE_URL, retrievedAt: row.receivedAt, contentHash: row.contentHash, content: row.rawEmail, parserStatus: "parsed" }).onConflictDoNothing();
  await upsertJurisdiction(db, jurisdiction);
  const storedSummary = (row.extractedJson as AfeExtraction & { reasonSummary?: string }).reasonSummary;
  const reasonSummary = storedSummary || await summarizeAfeReason(extraction.reason, extraction.namedEntities || []);
  if (extraction.alertType !== "new") {
    if (!canonicalOrderId) throw new Error("A canonical order ID is required to resolve a correction, revision, or cancellation.");
    const matched = (await db.select({ order: orders }).from(orders)
      .innerJoin(sourceSnapshots, eq(orders.sourceSnapshotId, sourceSnapshots.id))
      .innerJoin(sources, eq(sourceSnapshots.sourceId, sources.id))
      .where(and(eq(orders.id, canonicalOrderId), eq(orders.status, "published"), eq(sources.id, AFE_SOURCE_ID))))[0]?.order;
    if (!matched) throw new Error("The selected canonical order is not an active American Flags Express order.");
    const expectedScope = extraction.geographicScope === "nationwide" ? "nationwide" : "statewide";
    if (matched.jurisdictionId !== jurisdiction.id || matched.scope !== expectedScope || !sameFlags(matched.flagTypes as string[], extraction.flagTypes)) {
      throw new Error("The selected canonical order does not match this alert's jurisdiction, scope, and affected flags.");
    }
    if (extraction.alertType === "cancellation") {
      await db.update(orders).set({ status: "rejected", updatedAt: new Date() }).where(eq(orders.id, matched.id));
      await db.update(inboundEmails).set({ processingStatus: "cancelled", orderId: matched.id, error: null }).where(eq(inboundEmails.id, id));
      return { status: "cancelled", id, orderId: matched.id };
    }
    if (!extraction.effectiveStart) throw new Error("An approved correction or revision requires an effective start date.");
    await upsertOrder(db, { id: matched.id, title: extraction.title || row.subject || "American Flags Express alert", reason: reasonSummary, issuingAuthority: extraction.issuingAuthority, jurisdiction, flagTypes: extraction.flagTypes, scope: expectedScope, instructionType: "order", instructionText: extraction.instructionText, effectiveStart: extraction.effectiveStart, effectiveStartTime: extraction.effectiveStartTime || undefined, effectiveEnd: extraction.effectiveEnd || undefined, effectiveEndTime: extraction.effectiveEndTime || undefined, effectiveEndCondition: extraction.effectiveEndCondition || undefined, timeZone: extraction.timeZone || undefined, sourceUrl: AFE_SOURCE_URL, sourceSnapshotId: snapshotId, status: "published", createdAt: row.receivedAt.toISOString(), alertType: extraction.alertType, geographicScope: extraction.geographicScope, sourceMessageId: email.messageId });
    await db.update(inboundEmails).set({ processingStatus: "updated", orderId: matched.id, error: null }).where(eq(inboundEmails.id, id));
    return { status: "updated", id, orderId: matched.id };
  }
  if (!extraction.effectiveStart) throw new Error("An approved public order requires an effective start date.");
  const idForOrder = orderId(email, extraction);
  await upsertOrder(db, { id: idForOrder, title: extraction.title || row.subject || "American Flags Express alert", reason: reasonSummary, issuingAuthority: extraction.issuingAuthority, jurisdiction, flagTypes: extraction.flagTypes, scope: extraction.geographicScope, instructionType: "order", instructionText: extraction.instructionText, effectiveStart: extraction.effectiveStart, effectiveStartTime: extraction.effectiveStartTime || undefined, effectiveEnd: extraction.effectiveEnd || undefined, effectiveEndTime: extraction.effectiveEndTime || undefined, effectiveEndCondition: extraction.effectiveEndCondition || undefined, timeZone: extraction.timeZone || undefined, sourceUrl: AFE_SOURCE_URL, sourceSnapshotId: snapshotId, status: extraction.alertType === "cancellation" ? "rejected" : "published", createdAt: row.receivedAt.toISOString(), alertType: extraction.alertType, geographicScope: extraction.geographicScope, sourceMessageId: email.messageId });
  await db.update(inboundEmails).set({ processingStatus: "published", orderId: idForOrder, error: null }).where(eq(inboundEmails.id, id));
  return { status: "published", id, orderId: idForOrder };
}

export { AFE_SOURCE_ID, AFE_SOURCE_URL, AFE_TRUSTED_FORWARDERS };
