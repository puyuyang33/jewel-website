import { CustomerDashboardView } from "@/components/customer/dashboard-view";
import { getCustomerDashboard } from "@/lib/data/customer";

export default async function CustomerDashboardPage() {
  const dashboard = await getCustomerDashboard();
  return <CustomerDashboardView dashboard={dashboard} />;
}
