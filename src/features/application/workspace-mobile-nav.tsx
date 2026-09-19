"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function WorkspaceMobileNav({
  items,
}: {
  items: {
    href: string;
    label: string;
    icon: LucideIcon;
    exact?: boolean;
  }[];
}) {
  const pathname = usePathname();

  return (
    <nav
      className="horizontal-scroll border-ink/10 -mx-4 -mt-3 mb-7 flex snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain border-b px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:hidden"
      aria-label="Workspace sections"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isCurrent = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "border-ink/10 inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
              isCurrent
                ? "bg-ink text-porcelain border-ink"
                : "text-ink hover:bg-parchment bg-white",
            )}
          >
            <Icon aria-hidden="true" size={15} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
