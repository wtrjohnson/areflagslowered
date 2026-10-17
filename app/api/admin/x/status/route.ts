import { NextResponse } from "next/server";
import { getDb } from "../../../../../db/index.ts";
import { xPublishingStatus } from "../../../../../lib/x-publishing.ts";
import { getOperatorEmail } from "../../../../../lib/operator-auth.ts";

export async function GET() {
  if (!(await getOperatorEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await xPublishingStatus(getDb()));
}
