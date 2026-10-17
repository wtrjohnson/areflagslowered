import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.ts";
import { socialDrafts, socialPreviewSnapshots } from "../db/schema.ts";
import { upsertJurisdiction, upsertOrder, upsertSource, upsertSourceSnapshot } from "../db/orders.ts";
import { createShareToken } from "./share-preview-core.ts";
import { ensurePreviewTable } from "./social-preview.ts";
import { createXTestPostDraft } from "./social.ts";
import { createTestAlertResult, type TestAlertScenario } from "./test-alert.ts";
import { jurisdictionByCode } from "./jurisdictions.ts";
import { publishXDraft } from "./x-publishing.ts";
import type { HalfMastOrder } from "./types.ts";

type Database = ReturnType<typeof getDb>;

export async function publishTestXPost(db: Database, scenario: TestAlertScenario, requestId: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(requestId)) throw new Error("Invalid test request ID.");
  createTestAlertResult(scenario);
  const jurisdiction = jurisdictionByCode(scenario.stateCode);
  if (!jurisdiction) throw new Error("Choose a supported state or territory.");
  const token = createShareToken();
  const orderId = `test-order-${requestId}`;
  const draftId = `x-test-${requestId}`;
  const existing = (await db.select().from(socialDrafts).where(eq(socialDrafts.id, draftId)))[0];
  if (existing?.status === "published") return { status: "already_handled" as const, postId: existing.externalPostId || undefined, text: existing.text };
  const now = new Date();
  const order: HalfMastOrder = {
    id: orderId,
    title: `TEST — ${jurisdiction.name} half-mast alert`,
    reason: scenario.reason.replace(/\s+/g, " ").trim(),
    issuingAuthority: "Are Flags Lowered test console",
    jurisdiction,
    flagTypes: scenario.usStatus === "half_mast" ? ["us", "state"] : ["state"],
    scope: "statewide",
    instructionType: "order",
    instructionText: "TEST ONLY — excluded from live status calculations.",
    effectiveStart: scenario.effectiveStart,
    effectiveEnd: scenario.effectiveEnd || undefined,
    sourceUrl: "https://are-flags-lowered.kvex.chatgpt.site/admin/test-alert",
    sourceSnapshotId: `test-snapshot-${requestId}`,
    status: "needs_review",
    createdAt: now.toISOString(),
    alertType: "new",
    geographicScope: "unknown",
  };
  const draft = createXTestPostDraft(order, now.toISOString(), token);
  await upsertJurisdiction(db, jurisdiction);
  await upsertSource(db, { id: "test-alert-console", jurisdictionId: jurisdiction.id, name: "Are Flags Lowered test console", url: order.sourceUrl, sourceType: "manual", parserName: "test_console", priority: "primary", timeZone: jurisdiction.timeZone, pollIntervalMinutes: 0 });
  await upsertSourceSnapshot(db, { id: order.sourceSnapshotId, sourceId: "test-alert-console", url: order.sourceUrl, retrievedAt: now.toISOString(), contentHash: requestId, content: "Operator-created X test post. Not a live flag order.", parserStatus: "parsed" });
  await upsertOrder(db, order);
  await db.insert(socialDrafts).values({ id: draftId, orderId, text: draft.text, status: "draft", createdAt: now }).onConflictDoNothing({ target: socialDrafts.id });
  await ensurePreviewTable(db);
  await db.insert(socialPreviewSnapshots).values({ token, socialDraftId: draftId, jurisdictionId: jurisdiction.id, usStatus: scenario.usStatus, stateStatus: scenario.stateStatus, createdAt: now }).onConflictDoNothing({ target: socialPreviewSnapshots.socialDraftId });
  const claimed = await db.update(socialDrafts).set({ status: "approved", publishAttempts: sql`${socialDrafts.publishAttempts} + 1`, lastAttemptAt: now, publishError: null })
    .where(and(eq(socialDrafts.id, draftId), eq(socialDrafts.status, "draft"))).returning({ id: socialDrafts.id, text: socialDrafts.text });
  if (!claimed[0]) return { status: "already_handled" as const, text: existing?.text || draft.text };
  return { ...(await publishXDraft(db, draftId, claimed[0].text)), text: claimed[0].text };
}
