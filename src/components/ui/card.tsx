import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-ink/10 rounded-[1.75rem] border bg-white/72 shadow-[0_24px_80px_rgba(48,39,30,0.08)] backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}
