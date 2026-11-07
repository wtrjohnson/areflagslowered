import { NextResponse } from "next/server";
import { getDb } from "../../../db/index.ts";
import { feedback } from "../../../db/schema.ts";

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

export async function POST(request: Request) {
  try {
    const payload = await request.json() as FeedbackPayload;
    const message = text(payload.message, 3_000);
    const name = text(payload.name, 120);
    const email = text(payload.email, 254);
    const website = text(payload.website, 200);
    const pagePath = text(payload.pagePath, 300);

    // Quietly accept bot submissions without saving them.
    if (website) return NextResponse.json({ ok: true });
    if (message.length < 3) return NextResponse.json({ error: "Please enter a little more feedback." }, { status: 422 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 422 });

    await getDb().insert(feedback).values({
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
