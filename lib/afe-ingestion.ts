import { eq, or } from "drizzle-orm";
import { getDb } from "../db/index.ts";
import { inboundEmails, orders, sources, sourceSnapshots } from "../db/schema.ts";
import { upsertJurisdiction, upsertOrder, upsertSource } from "../db/orders.ts";
import { jurisdictionCatalog, federalJurisdiction } from "./jurisdictions.ts";
import { emailText, hashText, parseInboundEmail, type InboundEmail } from "./afe-email.ts";
import { extractAfeEmail, validateAfeExtraction, type AfeExtraction } from "./afe-extractor.ts";

const AFE_SOURCE_ID = "american-flags-express-email";
const AFE_SOURCE_URL = process.env.AFE_SOURCE_URL || "https://flagsexpress.com";

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

export function validateAfeSender(email: InboundEmail) {
  const text = emailText(email);
  const isDirectAfeMessage = /@flagsexpress\.com\b/i.test(email.sender);
  const isForwardedAfeMessage = /@flagsexpress\.com\b/i.test(text) && /American Flags Express/i.test(text);
  const isHalfStaffAlert = /\bHalf-Staff Alert\b/i.test(email.subject) || /\bHalf-Staff Alert\b/i.test(text);
  return (isDirectAfeMessage || isForwardedAfeMessage) && isHalfStaffAlert;
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
    const snapshotId = `afe-snapshot-${email.contentHash.slice(0, 24)}`;
    await db.insert(sourceSnapshots).values({ id: snapshotId, sourceId: AFE_SOURCE_ID, url: AFE_SOURCE_URL, retrievedAt: options.receivedAt || new Date(), contentHash: email.contentHash, content: rawEmail, parserStatus: "parsed" }).onConflictDoNothing();
    const jurisdiction = stateFor(extraction);
    const supported = extraction.geographicScope === "nationwide" || extraction.geographicScope === "statewide";
    const idForOrder = orderId(email, extraction);
    if (supported && !(extraction.alertType !== "new" && !extraction.externalId)) {
      await upsertJurisdiction(db, jurisdiction);
      await upsertOrder(db, { id: idForOrder, title: extraction.title || email.subject, reason: extraction.reason, issuingAuthority: extraction.issuingAuthority, jurisdiction, flagTypes: extraction.flagTypes, scope: extraction.geographicScope === "nationwide" ? "nationwide" : "statewide", instructionType: "order", instructionText: extraction.instructionText, effectiveStart: extraction.effectiveStart, effectiveStartTime: extraction.effectiveStartTime || undefined, effectiveEnd: extraction.effectiveEnd || undefined, effectiveEndTime: extraction.effectiveEndTime || undefined, effectiveEndCondition: extraction.effectiveEndCondition || undefined, timeZone: extraction.timeZone || undefined, sourceUrl: AFE_SOURCE_URL, sourceSnapshotId: snapshotId, status: extraction.alertType === "cancellation" ? "rejected" : "published", createdAt: (options.receivedAt || new Date()).toISOString(), alertType: extraction.alertType, geographicScope: extraction.geographicScope, sourceMessageId: email.messageId || options.providerMessageId });
      await db.update(inboundEmails).set({ extractedJson: extraction, processingStatus: "published", orderId: idForOrder }).where(eq(inboundEmails.id, id));
      return { status: "published", id, orderId: idForOrder, duplicate: false };
    }
    await db.update(inboundEmails).set({ extractedJson: extraction, processingStatus: "quarantined", error: extraction.geographicScope === "county" ? "County scope is not supported by the public v1 status model." : "Correction/revision requires an external order identifier." }).where(eq(inboundEmails.id, id));
    return { status: "quarantined", id, duplicate: false };
  } catch (error) {
    await db.update(inboundEmails).set({ processingStatus: "quarantined", error: error instanceof Error ? error.message : String(error) }).where(eq(inboundEmails.id, id));
    throw error;
  }
}

export async function approveAfeInboundEmail(id: string) {
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
  const idForOrder = orderId(email, extraction);
  await upsertJurisdiction(db, jurisdiction);
  await upsertOrder(db, { id: idForOrder, title: extraction.title || row.subject || "American Flags Express alert", reason: extraction.reason, issuingAuthority: extraction.issuingAuthority, jurisdiction, flagTypes: extraction.flagTypes, scope: extraction.geographicScope, instructionType: "order", instructionText: extraction.instructionText, effectiveStart: extraction.effectiveStart, effectiveStartTime: extraction.effectiveStartTime || undefined, effectiveEnd: extraction.effectiveEnd || undefined, effectiveEndTime: extraction.effectiveEndTime || undefined, effectiveEndCondition: extraction.effectiveEndCondition || undefined, timeZone: extraction.timeZone || undefined, sourceUrl: AFE_SOURCE_URL, sourceSnapshotId: snapshotId, status: extraction.alertType === "cancellation" ? "rejected" : "published", createdAt: row.receivedAt.toISOString(), alertType: extraction.alertType, geographicScope: extraction.geographicScope, sourceMessageId: email.messageId });
  await db.update(inboundEmails).set({ processingStatus: "published", orderId: idForOrder, error: null }).where(eq(inboundEmails.id, id));
  return { status: "published", id, orderId: idForOrder };
}

export { AFE_SOURCE_ID, AFE_SOURCE_URL };
