import Link from "next/link";
import type { ReactNode } from "react";

import {
  ApplicationNavigation,
  type ApplicationNavigationItem,
} from "@/components/application/application-navigation";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ApplicationShellProps {
  children: ReactNode;
  navigation: ApplicationNavigationItem[];
  workspaceLabel: string;
  user: {
    displayName: string;
    email: string;
  };
}

export function ApplicationShell({
  children,
  navigation,
  workspaceLabel,
  user,
}: ApplicationShellProps) {
  return (
    <div className="min-h-screen bg-[#f1ece3]">
      <aside className="border-ink/10 bg-porcelain fixed inset-y-0 left-0 hidden w-72 border-r p-5 xl:flex xl:flex-col">
        <Logo className="px-2 py-2" />
        <Badge className="mt-8 w-fit">{workspaceLabel}</Badge>
        <div className="mt-8 flex-1">
          <ApplicationNavigation items={navigation} />
        </div>
        <div className="border-ink/10 rounded-2xl border bg-white/65 p-4">
          <p className="text-ink truncate text-sm font-semibold">
            {user.displayName}
          </p>
          <p className="text-stone mt-1 truncate text-xs">{user.email}</p>
          <Button asChild className="mt-4 w-full" variant="secondary" size="sm">
            <Link href="/">Visit public site</Link>
          </Button>
        </div>
      </aside>
      <div className="xl:pl-72">
        <div className="border-ink/10 bg-porcelain/95 sticky top-0 z-40 border-b px-4 py-3 backdrop-blur-xl xl:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <Logo />
            <Badge className="max-w-[9rem] truncate text-[0.65rem] sm:max-w-none">
              {workspaceLabel}
            </Badge>
          </div>
        </div>
        <main
          id="main-content"
          className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
