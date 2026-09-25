import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getDb } from "../../../../db/index.ts";
import { inboundEmails } from "../../../../db/schema.ts";
import { approveAfeInboundEmail } from "../../../../lib/afe-ingestion.ts";

async function operatorAuthorized() {
  const email = (await headers()).get("oai-authenticated-user-email");
  const allowed = (process.env.AFE_OPERATOR_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

export async function GET() {
  if (!(await operatorAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await getDb().select().from(inboundEmails).where(eq(inboundEmails.processingStatus, "quarantined")).orderBy(desc(inboundEmails.createdAt));
  return NextResponse.json({ records: rows });
}

export async function POST(request: Request) {
  if (!(await operatorAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json() as { id?: string; action?: "approve" | "reject" };
  if (!payload.id || !payload.action) return NextResponse.json({ error: "id and action are required." }, { status: 400 });
  if (payload.action === "approve") return NextResponse.json(await approveAfeInboundEmail(payload.id));
  await getDb().update(inboundEmails).set({ processingStatus: "rejected", error: "Rejected by operator." }).where(and(eq(inboundEmails.id, payload.id), eq(inboundEmails.processingStatus, "quarantined")));
  return NextResponse.json({ status: "rejected", id: payload.id });
}
