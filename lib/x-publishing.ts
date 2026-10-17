import { and, eq } from "drizzle-orm";
import { socialDrafts } from "../db/schema.ts";
import type { getDb } from "../db/index.ts";
import { notifyInboundIssue } from "./monitoring.ts";
import { createXPostDraft } from "./social.ts";
import type { HalfMastOrder } from "./types.ts";

type Database = ReturnType<typeof getDb>;
type XPublishStatus = "posted" | "queued" | "already_handled" | "failed";

export type XPublishResult = { status: XPublishStatus; postId?: string };

function xPublishingEnabled() {
  return process.env.X_POSTING_ENABLED === "true" && Boolean(process.env.X_USER_ACCESS_TOKEN);
}

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}

async function createXPost(text: string) {
  const token = process.env.X_USER_ACCESS_TOKEN;
  if (!token) throw new Error("X_USER_ACCESS_TOKEN is not configured.");
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

/**
 * Saves every eligible public alert before attempting a post. A row may be
 * claimed only once, which makes duplicate webhook deliveries harmless. Failed
 * attempts intentionally remain claimed so a transport ambiguity cannot create
 * a duplicate public post; operators can inspect the alert and retry safely.
 */
export async function queueAndPublishXPost(db: Database, order: HalfMastOrder): Promise<XPublishResult> {
  const draft = createXPostDraft(order);
  await db.insert(socialDrafts).values({
    id: draft.id,
    orderId: draft.orderId,
    text: draft.text,
    status: "draft",
    createdAt: new Date(draft.createdAt),
  }).onConflictDoNothing({ target: socialDrafts.id });

  if (!xPublishingEnabled()) return { status: "queued" };

  const claimed = await db.update(socialDrafts)
    .set({ status: "approved" })
    .where(and(eq(socialDrafts.id, draft.id), eq(socialDrafts.status, "draft")))
    .returning({ id: socialDrafts.id, text: socialDrafts.text });
  if (!claimed[0]) return { status: "already_handled" };

  try {
    const postId = await createXPost(claimed[0].text);
    await db.update(socialDrafts).set({ status: "published" }).where(eq(socialDrafts.id, draft.id));
    return { status: "posted", postId };
  } catch (error) {
    const message = errorMessage(error);
    await notifyInboundIssue("X post needs attention", `@${(process.env.X_ACCOUNT_HANDLE || "areflagslowered").replace(/^@/, "")}\n${message}\nDraft: ${draft.id}`);
    return { status: "failed" };
  }
}
