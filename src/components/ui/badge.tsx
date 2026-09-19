import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "border-brass/35 bg-parchment text-ink inline-flex min-h-7 items-center rounded-full border px-3 text-xs font-semibold tracking-[0.08em] uppercase",
        className,
      )}
      {...props}
    />
  );
}
