import type { Metadata } from "next";
import {
  Clock3,
  CreditCard,
  FileCheck2,
  Gem,
  LayoutDashboard,
  MessageCircle,
  PenLine,
  UserRound,
} from "lucide-react";
import { redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application/application-shell";
import { WorkspaceMobileNav } from "@/features/application/workspace-mobile-nav";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: {
    default: "Private atelier",
    template: "%s · Veyra private atelier",
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
  { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/app/requests", label: "Design requests", icon: PenLine },
  {
    href: "/app/conversations",
    label: "Conversations",
    icon: MessageCircle,
  },
  { href: "/app/commissions", label: "Commissions", icon: Gem },
  { href: "/app/payments", label: "Payments", icon: CreditCard },
  { href: "/app/deliverables", label: "Deliverables", icon: FileCheck2 },
  { href: "/app/history", label: "History", icon: Clock3 },
  { href: "/app/profile", label: "Profile", icon: UserRound },
];

async function loadLayoutUser() {
  try {
    return await requireUser();
  } catch {
    redirect("/sign-in?next=/app");
  }
}

export default async function CustomerLayout({
  children,
}: LayoutProps<"/app">) {
  const user = await loadLayoutUser();
  return (
    <ApplicationShell
      navigation={navigation}
      workspaceLabel="Private room"
      user={{
        displayName: user.displayName ?? "Veyra collector",
        email: user.email,
      }}
    >
      <WorkspaceMobileNav items={navigation} />
      {children}
    </ApplicationShell>
  );
}
