import type { Metadata } from "next";
import {
  BookOpenCheck,
  CreditCard,
  FileKey2,
  Gem,
  History,
  Inbox,
  LayoutDashboard,
  PenLine,
  Settings2,
  UsersRound,
} from "lucide-react";
import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application/application-shell";
import { WorkspaceMobileNav } from "@/features/application/workspace-mobile-nav";
import { requireAdmin } from "@/lib/auth/dal";
import { AuthenticationError } from "@/lib/auth/errors";

export const metadata: Metadata = {
  title: {
    default: "Atelier operations",
    template: "%s · Veyra operations",
  },
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nocache: true,
  },
};

export const dynamic = "force-dynamic";

const navigation = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/inbox", label: "Unified inbox", icon: Inbox },
  { href: "/admin/customers", label: "Customers", icon: UsersRound },
  { href: "/admin/requests", label: "Requests", icon: PenLine },
  { href: "/admin/commissions", label: "Commissions", icon: Gem },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/deliverables", label: "Deliverables", icon: FileKey2 },
  { href: "/admin/portfolio", label: "Portfolio", icon: BookOpenCheck },
  { href: "/admin/settings", label: "Site settings", icon: Settings2 },
  { href: "/admin/audit", label: "Audit log", icon: History },
];

async function loadAdmin() {
  try {
    return await requireAdmin();
  } catch (error) {
    if (error instanceof AuthenticationError && error.code === "forbidden") {
      redirect("/app");
    }
    redirect("/sign-in?next=/admin");
  }
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await loadAdmin();
  return (
    <ApplicationShell
      navigation={navigation}
      workspaceLabel="Atelier operations"
      user={{
        displayName: admin.displayName ?? "Veyra administrator",
        email: admin.email,
      }}
    >
      <WorkspaceMobileNav items={navigation} />
      {children}
    </ApplicationShell>
  );
}
