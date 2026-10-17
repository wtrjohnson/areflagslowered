import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { completeXAuthorization } from "../../../../../lib/x-oauth.ts";

export const dynamic = "force-dynamic";

type ConnectionCookie = { state?: string; verifier?: string };

function successPage(account: string) {
  return `<!doctype html><title>X connected</title><main><h1>X connected</h1><p>${account} is now authorized to publish verified Are Flags Lowered alerts.</p><p>You can close this window.</p></main>`;
}

function clearConnectionCookie(response: NextResponse) {
  response.cookies.set("x-oauth-connect", "", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 0, path: "/api/integrations/x" });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = (await cookies()).get("x-oauth-connect")?.value;
  if (error || !code || !state || !saved) return clearConnectionCookie(new NextResponse(`X connection was not completed: ${error || "missing authorization details"}.`, { status: 400 }));

  let connection: ConnectionCookie;
  try {
    connection = JSON.parse(saved) as ConnectionCookie;
  } catch {
    return clearConnectionCookie(new NextResponse("X connection could not be verified. Please start again.", { status: 400 }));
  }
  if (connection.state !== state || !connection.verifier) return clearConnectionCookie(new NextResponse("X connection could not be verified. Please start again.", { status: 400 }));

  try {
    const account = await completeXAuthorization(process.env.ARE_FLAGS_LOWERED_URL || url.origin, code, connection.verifier);
    return clearConnectionCookie(new NextResponse(successPage(account), { headers: { "content-type": "text/html; charset=utf-8" } }));
  } catch (exception) {
    const message = exception instanceof Error ? exception.message : "X connection failed.";
    return clearConnectionCookie(new NextResponse(`X connection failed: ${message}`, { status: 400 }));
  }
}
