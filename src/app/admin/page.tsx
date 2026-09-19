import { AdminDashboardView } from "@/components/admin/dashboard-view";
import { getAdminDashboard } from "@/lib/data/admin";

export default async function AdminDashboardPage() {
  const dashboard = await getAdminDashboard();
  return <AdminDashboardView dashboard={dashboard} />;
}
