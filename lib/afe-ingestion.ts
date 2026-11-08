import { and, eq, or } from "drizzle-orm";
import { getDb } from "../db/index.ts";
import { inboundEmails, inboundReviewEvents, orders, sources, sourceSnapshots } from "../db/schema.ts";
import { upsertJurisdiction, upsertOrder, upsertSource } from "../db/orders.ts";
import { jurisdictionCatalog, federalJurisdiction } from "./jurisdictions.ts";
import { emailText, hashText, parseInboundEmail, type InboundEmail } from "./afe-email.ts";
import { selectOfficialSource, type OfficialSource } from "./official-source.ts";
import { extractAfeEmail, summarizeAfeReason, validateAfeExtraction, type AfeExtraction } from "./afe-extractor.ts";
import { notifyInboundIssue } from "./monitoring.ts";
import { queueAndPublishXPost } from "./x-publishing.ts";

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

function orderEvidence(source: OfficialSource) {
  return {
    officialSourceUrl: source.url,
    officialSourceTitle: source.title,
    officialSourcePublisher: source.publisher,
    officialSourcePublishedAt: source.publishedAt,
    officialSourceStatus: source.status === "needs_review" ? "not_available" as const : source.status,
  };
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
    // Keep the model output even when validation or summarization fails so an
    // operator can inspect and revise the candidate from the original email.
    await db.update(inboundEmails).set({ extractedJson: extraction }).where(eq(inboundEmails.id, id));
    validateAfeExtraction(extraction);
    const reasonSummary = await summarizeAfeReason(extraction.reason, extraction.namedEntities, options.apiKey, options.model);
    const officialSource = selectOfficialSource(email);
    if (officialSource.status === "needs_review") {
      const error = "A non-government source link was found and needs operator review before publication.";
      const candidate = { ...extraction, reasonSummary, officialSource };
      await db.update(inboundEmails).set({ extractedJson: candidate, processingStatus: "quarantined", error }).where(eq(inboundEmails.id, id));
      await notifyInboundIssue("inbound alert needs review", `${email.subject}\n${error}`);
      return { status: "quarantined", id, duplicate: false };
    }
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
      const publishedOrder = {
        id: idForOrder, title: extraction.title || email.subject, reason: reasonSummary, issuingAuthority: extraction.issuingAuthority, jurisdiction,
        flagTypes: extraction.flagTypes, scope: extraction.geographicScope === "nationwide" ? "nationwide" as const : "statewide" as const,
        instructionType: "order" as const, instructionText: extraction.instructionText, effectiveStart: extraction.effectiveStart,
        effectiveStartTime: extraction.effectiveStartTime || undefined, effectiveEnd: extraction.effectiveEnd || undefined,
        effectiveEndTime: extraction.effectiveEndTime || undefined, effectiveEndCondition: extraction.effectiveEndCondition || undefined,
        timeZone: extraction.timeZone || undefined, sourceUrl: AFE_SOURCE_URL, ...orderEvidence(officialSource), sourceSnapshotId: snapshotId, status: "published" as const,
        createdAt: (options.receivedAt || new Date()).toISOString(), alertType: extraction.alertType,
        geographicScope: extraction.geographicScope, sourceMessageId: email.messageId || options.providerMessageId,
      };
      await upsertJurisdiction(db, jurisdiction);
      await upsertOrder(db, publishedOrder);
      const xPost = await queueAndPublishXPost(db, publishedOrder);
      const processingStatus = matchedOrder ? "updated" : "published";
      await db.update(inboundEmails).set({ extractedJson: { ...extraction, reasonSummary, officialSource }, processingStatus, orderId: idForOrder }).where(eq(inboundEmails.id, id));
      return { status: processingStatus, id, orderId: idForOrder, duplicate: false, xPost: xPost.status };
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

async function publishAfeInboundEmail(id: string, canonicalOrderId?: string) {
  const db = getDb();
  const row = (await db.select().from(inboundEmails).where(eq(inboundEmails.id, id)))[0];
  if (!row?.extractedJson) throw new Error("No extracted candidate is available for this inbound email.");
  const extraction = row.extractedJson as AfeExtraction & { officialSource?: OfficialSource };
  validateAfeExtraction(extraction);
  if (extraction.geographicScope !== "nationwide" && extraction.geographicScope !== "statewide") throw new Error("Only nationwide and statewide orders can be approved in v1.");
  const email = parseInboundEmail(row.rawEmail);
  const officialSource = extraction.officialSource || selectOfficialSource(email);
  // A queued non-government link is never published as an official source.
  const safeOfficialSource = officialSource.status === "needs_review" ? { status: "not_available" as const, publishedAt: officialSource.publishedAt } : officialSource;
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
      const cancelledOrder = {
        id: matched.id, title: extraction.title || matched.title, reason: reasonSummary,
        issuingAuthority: extraction.issuingAuthority, jurisdiction, flagTypes: extraction.flagTypes,
        scope: expectedScope as "nationwide" | "statewide", instructionType: "order" as const,
        instructionText: extraction.instructionText, effectiveStart: extraction.effectiveStart || matched.effectiveStart,
        effectiveStartTime: extraction.effectiveStartTime || matched.effectiveStartTime || undefined,
        effectiveEnd: extraction.effectiveEnd || matched.effectiveEnd || undefined,
        effectiveEndTime: extraction.effectiveEndTime || matched.effectiveEndTime || undefined,
        effectiveEndCondition: extraction.effectiveEndCondition || matched.effectiveEndCondition || undefined,
        timeZone: extraction.timeZone || matched.timeZone || undefined, sourceUrl: AFE_SOURCE_URL, ...orderEvidence(safeOfficialSource),
        sourceSnapshotId: snapshotId, status: "rejected" as const, createdAt: matched.createdAt.toISOString(),
        alertType: extraction.alertType, geographicScope: extraction.geographicScope, sourceMessageId: email.messageId,
      };
      await upsertOrder(db, cancelledOrder);
      const xPost = await queueAndPublishXPost(db, cancelledOrder);
      await db.update(inboundEmails).set({ processingStatus: "cancelled", orderId: matched.id, error: null }).where(eq(inboundEmails.id, id));
      return { status: "cancelled", id, orderId: matched.id, xPost: xPost.status };
    }
    if (!extraction.effectiveStart) throw new Error("An approved correction or revision requires an effective start date.");
    const correctedOrder = {
      id: matched.id, title: extraction.title || row.subject || "American Flags Express alert", reason: reasonSummary,
      issuingAuthority: extraction.issuingAuthority, jurisdiction, flagTypes: extraction.flagTypes,
      scope: expectedScope as "nationwide" | "statewide", instructionType: "order" as const, instructionText: extraction.instructionText,
      effectiveStart: extraction.effectiveStart, effectiveStartTime: extraction.effectiveStartTime || undefined,
      effectiveEnd: extraction.effectiveEnd || undefined, effectiveEndTime: extraction.effectiveEndTime || undefined,
      effectiveEndCondition: extraction.effectiveEndCondition || undefined, timeZone: extraction.timeZone || undefined,
      sourceUrl: AFE_SOURCE_URL, ...orderEvidence(safeOfficialSource), sourceSnapshotId: snapshotId, status: "published" as const,
      createdAt: row.receivedAt.toISOString(), alertType: extraction.alertType, geographicScope: extraction.geographicScope,
      sourceMessageId: email.messageId,
    };
    await upsertOrder(db, correctedOrder);
    const xPost = await queueAndPublishXPost(db, correctedOrder);
    await db.update(inboundEmails).set({ processingStatus: "updated", orderId: matched.id, error: null }).where(eq(inboundEmails.id, id));
    return { status: "updated", id, orderId: matched.id, xPost: xPost.status };
  }
  if (!extraction.effectiveStart) throw new Error("An approved public order requires an effective start date.");
  const idForOrder = orderId(email, extraction);
  const newOrder = {
    id: idForOrder, title: extraction.title || row.subject || "American Flags Express alert", reason: reasonSummary,
    issuingAuthority: extraction.issuingAuthority, jurisdiction, flagTypes: extraction.flagTypes,
    scope: extraction.geographicScope as "nationwide" | "statewide", instructionType: "order" as const,
    instructionText: extraction.instructionText, effectiveStart: extraction.effectiveStart,
    effectiveStartTime: extraction.effectiveStartTime || undefined, effectiveEnd: extraction.effectiveEnd || undefined,
    effectiveEndTime: extraction.effectiveEndTime || undefined, effectiveEndCondition: extraction.effectiveEndCondition || undefined,
    timeZone: extraction.timeZone || undefined, sourceUrl: AFE_SOURCE_URL, ...orderEvidence(safeOfficialSource), sourceSnapshotId: snapshotId, status: "published" as const,
    createdAt: row.receivedAt.toISOString(), alertType: extraction.alertType, geographicScope: extraction.geographicScope,
    sourceMessageId: email.messageId,
  };
  await upsertOrder(db, newOrder);
  const xPost = await queueAndPublishXPost(db, newOrder);
  await db.update(inboundEmails).set({ processingStatus: "published", orderId: idForOrder, error: null }).where(eq(inboundEmails.id, id));
  return { status: "published", id, orderId: idForOrder, xPost: xPost.status };
}

async function reviewEvent(db: ReturnType<typeof getDb>, values: {
  inboundEmailId: string;
  eventType: string;
  operatorEmail?: string;
  note?: string;
  candidateSnapshot?: unknown;
  error?: string;
}) {
  await db.insert(inboundReviewEvents).values({
    id: `review-${crypto.randomUUID()}`,
    inboundEmailId: values.inboundEmailId,
    eventType: values.eventType,
    operatorEmail: values.operatorEmail,
    note: values.note,
    candidateSnapshot: values.candidateSnapshot,
    error: values.error,
  });
}

export async function approveAfeInboundEmail(id: string, canonicalOrderId: string | undefined, operatorEmail = "system", note?: string) {
  const db = getDb();
  const claimed = await db.update(inboundEmails)
    .set({ processingStatus: "approving" })
    .where(and(eq(inboundEmails.id, id), eq(inboundEmails.processingStatus, "quarantined")))
    .returning({ candidate: inboundEmails.extractedJson });
  if (!claimed[0]) throw new Error("This review item is no longer unresolved.");
  try {
    const result = await publishAfeInboundEmail(id, canonicalOrderId);
    await reviewEvent(db, { inboundEmailId: id, eventType: "approved", operatorEmail, note: note?.trim(), candidateSnapshot: claimed[0].candidate });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(inboundEmails).set({ processingStatus: "quarantined", error: message })
      .where(and(eq(inboundEmails.id, id), eq(inboundEmails.processingStatus, "approving")));
    await reviewEvent(db, { inboundEmailId: id, eventType: "approval_failed", operatorEmail, note: note?.trim(), candidateSnapshot: claimed[0].candidate, error: message });
    throw error;
  }
}

export async function requestAfeRevision(id: string, note: string, operatorEmail: string, options: { apiKey?: string; model?: string } = {}) {
  const feedback = note.trim();
  if (!feedback) throw new Error("Operator feedback is required.");
  const db = getDb();
  const claimed = await db.update(inboundEmails)
    .set({ processingStatus: "reprocessing" })
    .where(and(eq(inboundEmails.id, id), eq(inboundEmails.processingStatus, "quarantined")))
    .returning({ rawEmail: inboundEmails.rawEmail, priorCandidate: inboundEmails.extractedJson, validationError: inboundEmails.error });
  if (!claimed[0]) throw new Error("This review item is no longer unresolved.");
  await reviewEvent(db, { inboundEmailId: id, eventType: "revision_requested", operatorEmail, note: feedback, candidateSnapshot: claimed[0].priorCandidate });
  try {
    const email = parseInboundEmail(claimed[0].rawEmail);
    const extraction = await extractAfeEmail(email, options.apiKey, options.model, {
      priorCandidate: claimed[0].priorCandidate,
      validationError: claimed[0].validationError,
      operatorNote: feedback,
    });
    validateAfeExtraction(extraction);
    const reasonSummary = await summarizeAfeReason(extraction.reason, extraction.namedEntities, options.apiKey, options.model);
    const candidate = { ...extraction, reasonSummary };
    await db.update(inboundEmails).set({ extractedJson: candidate, processingStatus: "quarantined", error: null })
      .where(and(eq(inboundEmails.id, id), eq(inboundEmails.processingStatus, "reprocessing")));
    await reviewEvent(db, { inboundEmailId: id, eventType: "revision_completed", operatorEmail, note: feedback, candidateSnapshot: candidate });
    return { status: "quarantined", id, candidate };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(inboundEmails).set({ processingStatus: "quarantined", error: `Revision failed: ${message}` })
      .where(and(eq(inboundEmails.id, id), eq(inboundEmails.processingStatus, "reprocessing")));
    await reviewEvent(db, { inboundEmailId: id, eventType: "revision_failed", operatorEmail, note: feedback, candidateSnapshot: claimed[0].priorCandidate, error: message });
    throw error;
  }
}

export async function dismissAfeInboundEmail(id: string, reason: string, operatorEmail: string) {
  const note = reason.trim();
  if (!note) throw new Error("A dismissal reason is required.");
  const db = getDb();
  const dismissed = await db.update(inboundEmails)
    .set({ processingStatus: "rejected", error: note })
    .where(and(eq(inboundEmails.id, id), eq(inboundEmails.processingStatus, "quarantined")))
    .returning({ candidate: inboundEmails.extractedJson });
  if (!dismissed[0]) throw new Error("This review item is no longer unresolved.");
  await reviewEvent(db, { inboundEmailId: id, eventType: "dismissed", operatorEmail, note, candidateSnapshot: dismissed[0].candidate });
  return { status: "rejected", id };
}

export { AFE_SOURCE_ID, AFE_SOURCE_URL, AFE_TRUSTED_FORWARDERS };
