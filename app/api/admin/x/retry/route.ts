import { NextResponse } from "next/server";
import { getDb } from "../../../../../db/index.ts";
import { retryXPost } from "../../../../../lib/x-publishing.ts";
import { getOperatorEmail } from "../../../../../lib/operator-auth.ts";

export async function POST(request: Request) {
  if (!(await getOperatorEmail())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = request.headers.get("content-type")?.includes("application/json")
    ? await request.json() as { id?: string }
    : { id: String((await request.formData()).get("id") || "") };
  if (!payload.id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  try {
    return NextResponse.json(await retryXPost(getDb(), payload.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "X retry failed." }, { status: 422 });
  }
}

export async function GET(request: Request) {
  if (!(await getOperatorEmail())) return new NextResponse("Unauthorized", { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id?.startsWith("x-")) return new NextResponse("A valid X draft ID is required.", { status: 400 });
  return new NextResponse(`<!doctype html><title>Retry X post</title><main><h1>Retry X post</h1><p>This will make one new post from the saved alert draft.</p><form method="post"><input type="hidden" name="id" value="${id.replace(/"/g, "&quot;")}"><button type="submit">Retry post</button></form></main>`, { headers: { "content-type": "text/html; charset=utf-8" } });
}
