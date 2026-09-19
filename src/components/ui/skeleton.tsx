import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-ink/8 animate-pulse rounded-xl motion-reduce:animate-none",
        className,
      )}
      aria-hidden="true"
    />
  );
}
