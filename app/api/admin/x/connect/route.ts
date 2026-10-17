import { NextResponse } from "next/server";
import { chatGPTSignInPath, getChatGPTUser } from "../../../../../app/chatgpt-auth.ts";
import { createXAuthorizationUrl } from "../../../../../lib/x-oauth.ts";
import { isOperatorEmail } from "../../../../../lib/operator-auth.ts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.redirect(new URL(chatGPTSignInPath("/api/admin/x/connect"), request.url));
  if (!isOperatorEmail(user.email)) return new NextResponse("Only an approved Are Flags Lowered operator can connect X.", { status: 403 });

  const origin = process.env.ARE_FLAGS_LOWERED_URL || new URL(request.url).origin;
  const authorization = await createXAuthorizationUrl(origin);
  const response = NextResponse.redirect(authorization.url);
  response.cookies.set("x-oauth-connect", JSON.stringify({ state: authorization.state, verifier: authorization.verifier }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/integrations/x",
  });
  return response;
}
