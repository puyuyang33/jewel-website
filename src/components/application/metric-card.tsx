import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

interface MetricCardProps {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: MetricCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-stone text-sm font-semibold">{label}</p>
        <span className="bg-parchment text-garnet grid size-9 place-items-center rounded-full">
          <Icon aria-hidden="true" size={17} />
        </span>
      </div>
      <p className="font-display mt-8 text-4xl">{value}</p>
      <p className="text-stone mt-1 text-sm">{detail}</p>
    </Card>
  );
}
