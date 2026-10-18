import { NextResponse } from "next/server";
import { getDb } from "../../../db/index.ts";
import { formatInboundHealth, inboundHealth } from "../../../lib/inbound-health.ts";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const db = getDb();
    const summary = await inboundHealth(db);
    if (url.searchParams.get("format") === "text" || request.headers.get("accept")?.includes("text/plain")) {
      return new Response(formatInboundHealth(summary), { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return NextResponse.json({ source: "american-flags-express-email", summary });
  } catch {
    return NextResponse.json({ status: "unavailable", error: "Coverage database unavailable" }, { status: 503 });
  }
}
