import { headers } from "next/headers";

export function operatorEmails() {
  return (process.env.AFE_OPERATOR_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isOperatorEmail(email: string | null | undefined) {
  return Boolean(email && operatorEmails().includes(email.toLowerCase()));
}

export async function getOperatorEmail() {
  const email = (await headers()).get("oai-authenticated-user-email");
  return isOperatorEmail(email) ? email!.toLowerCase() : null;
}
