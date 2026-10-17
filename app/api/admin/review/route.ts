import { NextResponse } from "next/server";
import { approveAfeInboundEmail, dismissAfeInboundEmail, requestAfeRevision } from "../../../../lib/afe-ingestion.ts";
import { getOperatorEmail } from "../../../../lib/operator-auth.ts";

type ReviewPayload = {
  id?: string;
  action?: "approve" | "request_revision" | "dismiss";
  note?: string;
  canonicalOrderId?: string;
};

export async function POST(request: Request) {
  const operatorEmail = await getOperatorEmail();
  if (!operatorEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const payload = await request.json() as ReviewPayload;
    if (!payload.id || !payload.action) return NextResponse.json({ error: "id and action are required." }, { status: 400 });
    if (payload.action === "approve") {
      return NextResponse.json(await approveAfeInboundEmail(payload.id, payload.canonicalOrderId, operatorEmail, payload.note));
    }
    if (payload.action === "request_revision") {
      return NextResponse.json(await requestAfeRevision(payload.id, payload.note || "", operatorEmail));
    }
    return NextResponse.json(await dismissAfeInboundEmail(payload.id, payload.note || "", operatorEmail));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Review action failed." }, { status: 422 });
  }
}
