import { headers } from "next/headers";
import { notFound } from "next/navigation";
import TestAlertConsole from "./test-alert-console.tsx";

export const dynamic = "force-dynamic";

export default async function TestAlertPage() {
  const email = (await headers()).get("oai-authenticated-user-email");
  const allowed = (process.env.AFE_OPERATOR_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!email || !allowed.includes(email.toLowerCase())) notFound();
  return <TestAlertConsole />;
}
