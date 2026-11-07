import { NextResponse } from "next/server";
import { lt, lte, or, sql } from "drizzle-orm";
import { feedback, feedbackRateLimits } from "../../../db/schema.ts";
import { getRuntimeDb } from "../../../lib/runtime-db.ts";

type FeedbackPayload = {
  message?: unknown;
  name?: unknown;
  email?: unknown;
  website?: unknown;
  pagePath?: unknown;
};

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

const encoder = new TextEncoder();
const feedbackLimit = 5;
const feedbackWindowMs = 60 * 60 * 1_000;
const feedbackRetentionDays = Math.min(365, Math.max(7, Number(process.env.FEEDBACK_RETENTION_DAYS || 90) || 90));

async function clientBucketId(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const salt = process.env.FEEDBACK_RATE_LIMIT_SALT || "are-flags-lowered-feedback-rate-limit";
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}:${ip}`)));
  return `feedback-${Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

async function claimFeedbackSlot(request: Request) {
  const db = await getRuntimeDb();
  const now = new Date();
  const resetAt = new Date(now.getTime() + feedbackWindowMs);
  const id = await clientBucketId(request);
  const claimed = await db.insert(feedbackRateLimits).values({ id, count: 1, resetAt }).onConflictDoUpdate({
    target: feedbackRateLimits.id,
    set: {
      count: sql`CASE WHEN ${feedbackRateLimits.resetAt} <= ${now} THEN 1 ELSE ${feedbackRateLimits.count} + 1 END`,
      resetAt: sql`CASE WHEN ${feedbackRateLimits.resetAt} <= ${now} THEN ${resetAt} ELSE ${feedbackRateLimits.resetAt} END`,
    },
    where: or(lte(feedbackRateLimits.resetAt, now), lt(feedbackRateLimits.count, feedbackLimit)),
  }).returning({ id: feedbackRateLimits.id });
  return { db, claimed: Boolean(claimed[0]) };
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Feedback must be sent from this site." }, { status: 403 });
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 8_192) return NextResponse.json({ error: "Feedback is too large." }, { status: 413 });
    const rawPayload = await request.text();
    if (encoder.encode(rawPayload).byteLength > 8_192) return NextResponse.json({ error: "Feedback is too large." }, { status: 413 });
    const payload = JSON.parse(rawPayload) as FeedbackPayload;
    const message = text(payload.message, 3_000);
    const name = text(payload.name, 120);
    const email = text(payload.email, 254);
    const website = text(payload.website, 200);
    const pagePath = text(payload.pagePath, 300);

    // Quietly accept bot submissions without saving them.
    if (website) return NextResponse.json({ ok: true });
    if (message.length < 3) return NextResponse.json({ error: "Please enter a little more feedback." }, { status: 422 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 422 });

    const { db, claimed } = await claimFeedbackSlot(request);
    if (!claimed) return NextResponse.json({ error: "Please wait before sending more feedback." }, { status: 429, headers: { "retry-after": "3600" } });
    await db.delete(feedback).where(lt(feedback.createdAt, new Date(Date.now() - feedbackRetentionDays * 24 * 60 * 60 * 1_000)));
    await db.insert(feedback).values({
      id: `feedback-${crypto.randomUUID()}`,
      message,
      name: name || null,
      email: email || null,
      pagePath: pagePath || null,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "We couldn't save your feedback right now. Please try again." }, { status: 503 });
  }
}
