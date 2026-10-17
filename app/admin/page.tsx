import { notFound } from "next/navigation";
import { getDb } from "../../db/index.ts";
import { adminDashboardData } from "../../lib/admin-dashboard.ts";
import { getOperatorEmail } from "../../lib/operator-auth.ts";
import AdminConsole from "./admin-console.tsx";
import "./admin.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const operatorEmail = await getOperatorEmail();
  if (!operatorEmail) notFound();
  const initialData = await adminDashboardData(getDb());
  return <AdminConsole initialData={initialData} operatorEmail={operatorEmail} />;
}
