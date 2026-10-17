import { NextResponse } from "next/server";
import { getDb } from "../../../../db/index.ts";
import { adminDashboardData } from "../../../../lib/admin-dashboard.ts";
import { getOperatorEmail } from "../../../../lib/operator-auth.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getOperatorEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await adminDashboardData(getDb()));
}
