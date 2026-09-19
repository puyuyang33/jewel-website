import Link from "next/link";

import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      className={cn(
        "group focus-visible:outline-garnet inline-flex items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4",
        className,
      )}
      href="/"
      aria-label="Veyra Atelier home"
    >
      <span
        aria-hidden="true"
        className="border-brass grid size-9 rotate-45 place-items-center border transition-transform duration-500 group-hover:rotate-[135deg]"
      >
        <span className="bg-garnet size-2 rounded-full" />
      </span>
      <span className="font-display text-xl tracking-[0.12em] uppercase">
        Veyra
      </span>
    </Link>
  );
}
