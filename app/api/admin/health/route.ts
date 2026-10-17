import { NextResponse } from "next/server";
import { getDb } from "../../../../db/index.ts";
import { formatInboundHealth, inboundHealth } from "../../../../lib/inbound-health.ts";
import { sendMonitoringEmail } from "../../../../lib/monitoring.ts";
import { getOperatorEmail } from "../../../../lib/operator-auth.ts";

function scheduledAuthorized(request: Request) {
  const expected = process.env.MONITORING_SCHEDULE_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && supplied === expected);
}

export async function GET() {
  if (!(await getOperatorEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await inboundHealth(getDb()));
}

export async function POST(request: Request) {
  if (!scheduledAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await inboundHealth(getDb());
  const delivery = await sendMonitoringEmail({ subject: "Are Flags Lowered: daily AFE health", text: formatInboundHealth(summary) });
  return NextResponse.json({ summary, delivery }, { status: delivery.sent ? 200 : 503 });
}
