import { eq, sql } from "drizzle-orm";
import { socialPreviewSnapshots } from "../db/schema.ts";
import type { getDb } from "../db/index.ts";
import { jurisdictionByCode, jurisdictionBySlug, type JurisdictionDefinition } from "./jurisdictions.ts";
import { flagStatuses, resolveLiveStatus } from "./live-status.ts";
import type { HalfMastOrder } from "./types.ts";
import { createShareToken, validShareToken } from "./share-preview-core.ts";
import type { PreviewStatus } from "./share-preview-core.ts";

export { createShareToken, previewAltText, previewImageUrl, previewTitle, validShareToken } from "./share-preview-core.ts";
export type { PreviewStatus } from "./share-preview-core.ts";

type Database = ReturnType<typeof getDb>;
export type PreviewSnapshot = {
  token: string;
  socialDraftId: string;
  jurisdictionId: string;
  usStatus: PreviewStatus;
  stateStatus: PreviewStatus;
  createdAt: Date;
};

/** The image attached to an alert shows the lowering being announced. */
export function announcementPreviewStatuses() {
  return { usStatus: "half_mast" as const, stateStatus: "half_mast" as const };
}

export async function ensurePreviewTable(db: Database) {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS "social_preview_snapshots" (
    "token" text PRIMARY KEY NOT NULL,
    "social_draft_id" text NOT NULL REFERENCES "social_drafts"("id"),
    "jurisdiction_id" text NOT NULL REFERENCES "jurisdictions"("id"),
    "us_status" "current_status_value" NOT NULL,
    "state_status" "current_status_value" NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "social_preview_snapshots_draft_idx" ON "social_preview_snapshots" ("social_draft_id")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "social_preview_snapshots_jurisdiction_idx" ON "social_preview_snapshots" ("jurisdiction_id")`);
}

export async function getPreviewByDraft(db: Database, socialDraftId: string) {
  return (await db.select().from(socialPreviewSnapshots).where(eq(socialPreviewSnapshots.socialDraftId, socialDraftId)))[0] as PreviewSnapshot | undefined;
}

export async function getPreviewByToken(db: Database, token: string) {
  if (!validShareToken(token)) return undefined;
  await ensurePreviewTable(db);
  return (await db.select().from(socialPreviewSnapshots).where(eq(socialPreviewSnapshots.token, token)))[0] as PreviewSnapshot | undefined;
}

export async function ensurePreviewSnapshot(db: Database, order: HalfMastOrder, socialDraftId: string) {
  await ensurePreviewTable(db);
  const existing = await getPreviewByDraft(db, socialDraftId);
  if (existing) return existing;
  const jurisdiction = jurisdictionByCode(order.jurisdiction.stateCode || "");
  if (!jurisdiction) throw new Error("A supported jurisdiction is required for an X preview.");
  // An X post is an announcement, not a point-in-time status report. Orders
  // often arrive before their effective date, so using the live lookup here
  // would freeze an otherwise correct announcement with flags at full mast.
  const statuses = announcementPreviewStatuses();
  const token = createShareToken();
  await db.insert(socialPreviewSnapshots).values({
    token,
    socialDraftId,
    jurisdictionId: jurisdiction.id,
    ...statuses,
  }).onConflictDoNothing({ target: socialPreviewSnapshots.socialDraftId });
  const saved = await getPreviewByDraft(db, socialDraftId);
  if (!saved) throw new Error("The X preview snapshot could not be saved.");
  return saved;
}

export async function previewForJurisdiction(db: Database, jurisdiction: JurisdictionDefinition, token?: string) {
  if (token) {
    const snapshot = await getPreviewByToken(db, token);
    return snapshot?.jurisdictionId === jurisdiction.id ? snapshot : undefined;
  }
  const statuses = flagStatuses(await resolveLiveStatus(db, jurisdiction));
  return { token: "", socialDraftId: "", jurisdictionId: jurisdiction.id, ...statuses, createdAt: new Date() } satisfies PreviewSnapshot;
}

export function jurisdictionFromImageAsset(asset: string) {
  return asset.endsWith(".png") ? jurisdictionBySlug(asset.slice(0, -4)) : undefined;
}
