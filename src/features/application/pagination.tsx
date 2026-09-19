import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  path,
  query,
}: {
  page: number;
  pageCount: number;
  path: string;
  query?: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) {
    return null;
  }

  function href(nextPage: number) {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value) {
        parameters.set(key, value);
      }
    }
    parameters.set("page", String(nextPage));
    return `${path}?${parameters.toString()}`;
  }

  return (
    <nav
      className="border-ink/10 mt-6 flex items-center justify-between border-t pt-5"
      aria-label="Pagination"
    >
      <Link
        href={href(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
        className={cn(
          "border-ink/15 inline-flex min-h-11 items-center gap-2 rounded-full border bg-white px-4 text-sm font-semibold",
          page <= 1 && "pointer-events-none opacity-40",
        )}
      >
        <ChevronLeft aria-hidden="true" size={16} />
        Previous
      </Link>
      <p className="text-stone text-sm">
        Page <strong className="text-ink">{page}</strong> of {pageCount}
      </p>
      <Link
        href={href(Math.min(pageCount, page + 1))}
        aria-disabled={page >= pageCount}
        tabIndex={page >= pageCount ? -1 : undefined}
        className={cn(
          "border-ink/15 inline-flex min-h-11 items-center gap-2 rounded-full border bg-white px-4 text-sm font-semibold",
          page >= pageCount && "pointer-events-none opacity-40",
        )}
      >
        Next
        <ChevronRight aria-hidden="true" size={16} />
      </Link>
    </nav>
  );
}
