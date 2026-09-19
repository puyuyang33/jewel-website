"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface ApplicationNavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export function ApplicationNavigation({
  items,
}: {
  items: ApplicationNavigationItem[];
}) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1" aria-label="Workspace navigation">
      {items.map((item) => {
        const isCurrent = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "focus-visible:outline-garnet flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2",
              isCurrent
                ? "bg-ink text-porcelain shadow-sm"
                : "text-stone hover:bg-parchment hover:text-ink",
            )}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
