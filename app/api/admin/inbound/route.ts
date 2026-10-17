import { NextResponse } from "next/server";
import { getDb } from "../../../../db/index.ts";
import { adminDashboardData } from "../../../../lib/admin-dashboard.ts";
import { getOperatorEmail } from "../../../../lib/operator-auth.ts";
import { approveAfeInboundEmail, dismissAfeInboundEmail } from "../../../../lib/afe-ingestion.ts";

export async function GET() {
  if (!(await getOperatorEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ records: (await adminDashboardData(getDb())).queue });
}

export async function POST(request: Request) {
  const operatorEmail = await getOperatorEmail();
  if (!operatorEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json() as { id?: string; action?: "approve" | "reject"; canonicalOrderId?: string };
  if (!payload.id || !payload.action) return NextResponse.json({ error: "id and action are required." }, { status: 400 });
  try {
    if (payload.action === "approve") return NextResponse.json(await approveAfeInboundEmail(payload.id, payload.canonicalOrderId, operatorEmail));
    return NextResponse.json(await dismissAfeInboundEmail(payload.id, "Rejected by operator.", operatorEmail));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Review action failed." }, { status: 422 });
  }
}
