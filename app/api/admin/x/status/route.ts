import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getDb } from "../../../../../db/index.ts";
import { xPublishingStatus } from "../../../../../lib/x-publishing.ts";

async function operatorAuthorized() {
  const email = (await headers()).get("oai-authenticated-user-email");
  const allowed = (process.env.AFE_OPERATOR_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

export async function GET() {
  if (!(await operatorAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await xPublishingStatus(getDb()));
}
