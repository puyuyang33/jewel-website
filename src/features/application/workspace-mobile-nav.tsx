import type { LucideIcon } from "lucide-react";
import Link from "next/link";

export function WorkspaceMobileNav({
  items,
}: {
  items: { href: string; label: string; icon: LucideIcon }[];
}) {
  return (
    <nav
      className="border-ink/10 -mx-4 -mt-5 mb-8 flex gap-2 overflow-x-auto border-b px-4 pb-4 xl:hidden"
      aria-label="Workspace sections"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="border-ink/10 text-ink inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border bg-white px-4 text-sm font-semibold"
          >
            <Icon aria-hidden="true" size={15} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
