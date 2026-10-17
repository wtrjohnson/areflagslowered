import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getDb } from "../../../../../db/index.ts";
import { retryXPost } from "../../../../../lib/x-publishing.ts";

async function operatorAuthorized() {
  const email = (await headers()).get("oai-authenticated-user-email");
  const allowed = (process.env.AFE_OPERATOR_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

export async function POST(request: Request) {
  if (!(await operatorAuthorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json() as { id?: string };
  if (!payload.id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  try {
    return NextResponse.json(await retryXPost(getDb(), payload.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "X retry failed." }, { status: 422 });
  }
}
