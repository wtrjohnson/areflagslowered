import { and, desc, eq, sql } from "drizzle-orm";
import { socialDrafts } from "../db/schema.ts";
import { getOrderById } from "../db/orders.ts";
import type { getDb } from "../db/index.ts";
import { notifyInboundIssue } from "./monitoring.ts";
import { createXPostDraft, xDraftId } from "./social.ts";
import { ensurePreviewSnapshot } from "./social-preview.ts";
import { getXAccessToken } from "./x-oauth.ts";
import type { HalfMastOrder } from "./types.ts";

type Database = ReturnType<typeof getDb>;
type XPublishStatus = "posted" | "queued" | "already_handled" | "failed";

export type XPublishResult = { status: XPublishStatus; postId?: string; error?: string };

function xPublishingEnabled() {
  return process.env.X_POSTING_ENABLED === "true";
}

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}

async function createXPost(token: string, text: string) {
  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const payload = await response.json().catch(() => ({})) as { data?: { id?: string }; detail?: string; title?: string; errors?: Array<{ detail?: string }> };
  if (!response.ok || !payload.data?.id) {
    throw new Error(payload.detail || payload.errors?.[0]?.detail || payload.title || `X API returned ${response.status}.`);
  }
  return payload.data.id;
}

async function ensureDeliveryMetadata(db: Database) {
  await db.execute(sql`ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone`);
  await db.execute(sql`ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "external_post_id" text`);
  await db.execute(sql`ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "publish_error" text`);
  await db.execute(sql`ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "publish_attempts" integer DEFAULT 0 NOT NULL`);
  await db.execute(sql`ALTER TABLE "social_drafts" ADD COLUMN IF NOT EXISTS "last_attempt_at" timestamp with time zone`);
}

async function xAccessToken(db: Database) {
  if (!xPublishingEnabled()) return undefined;
  try {
    return await getXAccessToken(db);
  } catch (error) {
    await notifyInboundIssue("X authorization needs attention", errorMessage(error));
    return undefined;
  }
}

async function publishClaimedDraft(db: Database, id: string, text: string, token: string): Promise<XPublishResult> {
  try {
    const postId = await createXPost(token, text);
    await db.update(socialDrafts).set({ status: "published", externalPostId: postId, publishedAt: new Date(), publishError: null }).where(eq(socialDrafts.id, id));
    return { status: "posted", postId };
  } catch (error) {
    const message = errorMessage(error);
    await db.update(socialDrafts).set({ publishError: message }).where(eq(socialDrafts.id, id));
    await notifyInboundIssue("X post needs attention", `@${(process.env.X_ACCOUNT_HANDLE || "areflagslowered").replace(/^@/, "")}\n${message}\nDraft: ${id}`);
    return { status: "failed", error: message };
  }
}

/**
 * Saves every eligible public alert before attempting a post. A row may be
 * claimed only once, which makes duplicate webhook deliveries harmless. Failed
 * attempts intentionally remain claimed so a transport ambiguity cannot create
 * a duplicate public post; operators can inspect the alert and retry safely.
 */
export async function queueAndPublishXPost(db: Database, order: HalfMastOrder): Promise<XPublishResult> {
  await ensureDeliveryMetadata(db);
  const id = xDraftId(order);
  await db.insert(socialDrafts).values({
    id,
    orderId: order.id,
    text: "",
    status: "draft",
  }).onConflictDoNothing({ target: socialDrafts.id });
  let draft;
  try {
    const preview = await ensurePreviewSnapshot(db, order, id);
    draft = createXPostDraft(order, new Date().toISOString(), preview.token);
    await db.update(socialDrafts).set({ text: draft.text, publishError: null }).where(eq(socialDrafts.id, id));
  } catch (error) {
    const message = `Preview snapshot failed: ${errorMessage(error)}`;
    await db.update(socialDrafts).set({ status: "approved", publishError: message }).where(eq(socialDrafts.id, id));
    await notifyInboundIssue("X preview needs attention", `${order.jurisdiction.name}\n${message}\nDraft: ${id}`);
    return { status: "failed", error: message };
  }

  const token = await xAccessToken(db);
  if (!token) return { status: "queued" };

  const claimed = await db.update(socialDrafts)
    .set({ status: "approved", publishAttempts: sql`${socialDrafts.publishAttempts} + 1`, lastAttemptAt: new Date(), publishError: null })
    .where(and(eq(socialDrafts.id, draft.id), eq(socialDrafts.status, "draft")))
    .returning({ id: socialDrafts.id, text: socialDrafts.text });
  if (!claimed[0]) return { status: "already_handled" };

  return publishClaimedDraft(db, draft.id, claimed[0].text, token);
}

export async function retryXPost(db: Database, id: string): Promise<XPublishResult> {
  if (!id.startsWith("x-")) throw new Error("Only X publishing drafts can be retried.");
  await ensureDeliveryMetadata(db);
  const draft = (await db.select().from(socialDrafts).where(eq(socialDrafts.id, id)))[0];
  if (!draft) throw new Error("X draft not found.");
  if (draft.status === "published") return { status: "already_handled", postId: draft.externalPostId || undefined };
  const order = await getOrderById(db, draft.orderId);
  if (!order) return { status: "failed", error: "The order for this X draft no longer exists." };
  let text: string;
  try {
    const preview = await ensurePreviewSnapshot(db, order, id);
    text = createXPostDraft(order, draft.createdAt.toISOString(), preview.token).text;
    await db.update(socialDrafts).set({ text, publishError: null }).where(eq(socialDrafts.id, id));
  } catch (error) {
    const message = `Preview snapshot failed: ${errorMessage(error)}`;
    await db.update(socialDrafts).set({ publishError: message }).where(eq(socialDrafts.id, id));
    return { status: "failed", error: message };
  }
  const token = await xAccessToken(db);
  if (!token) return { status: "queued", error: "X is not connected." };
  await db.update(socialDrafts).set({ status: "approved", publishAttempts: sql`${socialDrafts.publishAttempts} + 1`, lastAttemptAt: new Date(), publishError: null }).where(eq(socialDrafts.id, id));
  return publishClaimedDraft(db, id, text, token);
}

export async function xPublishingStatus(db: Database) {
  await ensureDeliveryMetadata(db);
  const drafts = await db.select({
    id: socialDrafts.id,
    orderId: socialDrafts.orderId,
    text: socialDrafts.text,
    status: socialDrafts.status,
    createdAt: socialDrafts.createdAt,
    publishedAt: socialDrafts.publishedAt,
    externalPostId: socialDrafts.externalPostId,
    publishError: socialDrafts.publishError,
    publishAttempts: socialDrafts.publishAttempts,
    lastAttemptAt: socialDrafts.lastAttemptAt,
  }).from(socialDrafts).where(sql`${socialDrafts.id} LIKE 'x-%'`).orderBy(desc(socialDrafts.createdAt)).limit(20);
  return { connected: Boolean(await xAccessToken(db)), drafts };
}
