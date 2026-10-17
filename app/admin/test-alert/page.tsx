import { notFound } from "next/navigation";
import TestAlertConsole from "./test-alert-console.tsx";
import { getOperatorEmail } from "../../../lib/operator-auth.ts";

export const dynamic = "force-dynamic";

export default async function TestAlertPage() {
  if (!(await getOperatorEmail())) notFound();
  return <TestAlertConsole />;
}
