import { NextResponse } from "next/server";
import { ingestAfeEmail } from "../../../../../lib/afe-ingestion.ts";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const expected = process.env.CLOUDMAILIN_WEBHOOK_TOKEN || process.env.CLOUDMAILIN_SHARED_SECRET;
  if (!expected || token !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const raw = await request.text();
    if (!raw.trim()) return NextResponse.json({ error: "No email payload supplied." }, { status: 400 });
    const result = await ingestAfeEmail(raw, { providerMessageId: request.headers.get("x-cloudmailin-message-id") || undefined });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Email ingestion failed." }, { status: 422 });
  }
}
