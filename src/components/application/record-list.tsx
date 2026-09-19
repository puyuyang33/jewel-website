import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

export interface RecordListItem {
  id: string;
  href: string;
  title: string;
  description: string;
  meta: string;
  status?: ReactNode;
  leading?: ReactNode;
}

export function RecordList({
  items,
  label,
}: {
  items: RecordListItem[];
  label: string;
}) {
  return (
    <Card className="overflow-hidden">
      <ul className="divide-ink/10 divide-y" aria-label={label}>
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="hover:bg-parchment/45 focus-visible:outline-garnet grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition focus-visible:outline-2 focus-visible:-outline-offset-2 sm:gap-4 sm:px-5"
            >
              {item.leading}
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-3">
                  <span className="text-ink truncate font-semibold">
                    {item.title}
                  </span>
                  {item.status}
                </span>
                <span className="text-stone mt-1 block truncate text-sm">
                  {item.description}
                </span>
                <span className="text-stone mt-2 block text-xs">
                  {item.meta}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                size={18}
                className="text-stone"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
