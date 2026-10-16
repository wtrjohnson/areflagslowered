import { NextResponse } from "next/server";
import { ingestAfeEmail } from "../../../../../lib/afe-ingestion.ts";
import { notifyInboundIssue } from "../../../../../lib/monitoring.ts";

function isRawMimeMessage(value: string) {
  return /^(?:[\w-]+:[^\r\n]*\r?\n){2,}\r?\n/.test(value);
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const expected = process.env.CLOUDMAILIN_WEBHOOK_TOKEN || process.env.CLOUDMAILIN_SHARED_SECRET;
  if (!expected || token !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const contentType = request.headers.get("content-type") || "";
    let raw = "";
    let providerMessageId = request.headers.get("x-cloudmailin-message-id") || "";
    if (contentType.includes("application/json")) {
      const payload = await request.json() as Record<string, unknown>;
      const envelope = payload.envelope as { from?: string; to?: string } | undefined;
      const headers = payload.headers as Record<string, unknown> | undefined;
      const value = String(payload.raw || payload.raw_email || payload.email || payload.plain || payload["body-plain"] || payload.body || "");
      raw = isRawMimeMessage(value) ? value : `From: ${payload.from || envelope?.from || headers?.from || headers?.From || ""}\nTo: ${payload.to || envelope?.to || headers?.to || headers?.To || ""}\nSubject: ${payload.subject || headers?.subject || headers?.Subject || ""}\nMessage-Id: ${payload.message_id || payload.messageId || headers?.["message-id"] || headers?.["Message-Id"] || ""}\nContent-Type: text/plain; charset=utf-8\n\n${value}`;
      providerMessageId ||= String(payload.message_id || payload.messageId || "");
    } else if (contentType.includes("form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const value = String(form.get("raw") || form.get("raw_email") || form.get("email") || form.get("plain") || form.get("body-plain") || form.get("body") || "");
      raw = isRawMimeMessage(value) ? value : `From: ${form.get("from") || ""}\nTo: ${form.get("to") || ""}\nSubject: ${form.get("subject") || ""}\nMessage-Id: ${form.get("message-id") || form.get("message_id") || ""}\nContent-Type: text/plain; charset=utf-8\n\n${value}`;
      providerMessageId ||= String(form.get("message-id") || form.get("message_id") || "");
    } else {
      raw = await request.text();
    }
    if (!raw.trim()) return NextResponse.json({ error: "No email payload supplied." }, { status: 400 });
    const result = await ingestAfeEmail(raw, { providerMessageId: providerMessageId || undefined });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email ingestion failed.";
    await notifyInboundIssue("CloudMailin processing failed", message);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
