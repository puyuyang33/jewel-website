import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "attention" | "positive" | "critical" | "info";

const tones: Record<StatusTone, string> = {
  neutral: "border-ink/15 bg-white text-stone",
  attention: "border-brass/35 bg-amber-50 text-amber-900",
  positive: "border-sage/35 bg-emerald-50 text-emerald-900",
  critical: "border-red-300 bg-red-50 text-red-800",
  info: "border-blue-300 bg-blue-50 text-blue-800",
};

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: StatusTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-3 text-xs font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
