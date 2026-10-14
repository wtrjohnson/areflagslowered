import { NextResponse } from "next/server";
import { ingestAfeEmail } from "../../../../lib/afe-ingestion.ts";

function isRawMimeMessage(value: string) {
  return /^(?:[\w-]+:[^\r\n]*\r?\n){2,}\r?\n/.test(value);
}

function authorized(request: Request) {
  const expected = process.env.CLOUDMAILIN_SHARED_SECRET;
  if (!expected) return false;
  const supplied = request.headers.get("x-cloudmailin-secret") || request.headers.get("x-webhook-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return supplied === expected;
}

async function rawEmailFrom(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await request.json() as Record<string, unknown>;
    const raw = payload.raw || payload.raw_email || payload.email || payload.plain || payload["body-plain"] || payload.body;
    const value = typeof raw === "string" ? raw : JSON.stringify(payload);
    const headers = payload.headers as Record<string, unknown> | undefined;
    const envelope = payload.envelope as { from?: string; to?: string } | undefined;
    const wrapped = isRawMimeMessage(value) ? value : `From: ${payload.from || envelope?.from || headers?.from || headers?.From || ""}\nTo: ${payload.to || envelope?.to || headers?.to || headers?.To || ""}\nSubject: ${payload.subject || headers?.subject || headers?.Subject || ""}\nMessage-Id: ${payload.message_id || payload.messageId || headers?.["message-id"] || headers?.["Message-Id"] || ""}\nContent-Type: text/plain; charset=utf-8\n\n${value}`;
    return { raw: wrapped, providerMessageId: String(payload.message_id || payload.messageId || payload["Message-Id"] || "") };
  }
  if (contentType.includes("form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const rawValue = String(form.get("raw") || form.get("raw_email") || form.get("email") || form.get("plain") || form.get("body-plain") || form.get("body") || "");
    const raw = isRawMimeMessage(rawValue) ? rawValue : `From: ${form.get("from") || ""}\nTo: ${form.get("to") || ""}\nSubject: ${form.get("subject") || ""}\nMessage-Id: ${form.get("message-id") || form.get("message_id") || ""}\nContent-Type: text/plain; charset=utf-8\n\n${rawValue}`;
    return { raw, providerMessageId: String(form.get("message-id") || form.get("message_id") || form.get("Message-Id") || "") };
  }
  return { raw: await request.text(), providerMessageId: request.headers.get("x-cloudmailin-message-id") || "" };
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { raw, providerMessageId } = await rawEmailFrom(request);
    if (!raw.trim()) return NextResponse.json({ error: "No email payload supplied." }, { status: 400 });
    const result = await ingestAfeEmail(raw, { providerMessageId: providerMessageId || undefined });
    return NextResponse.json(result, { status: result.duplicate || result.status === "published" || result.status === "quarantined" ? 200 : 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Email ingestion failed." }, { status: 422 });
  }
}
