import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Card className="grid min-h-72 place-items-center border-dashed p-8 text-center">
      <div className="max-w-md">
        <span className="bg-parchment text-garnet mx-auto grid size-12 place-items-center rounded-full">
          <Icon aria-hidden="true" size={21} />
        </span>
        <h2 className="font-display mt-5 text-3xl">{title}</h2>
        <p className="text-stone mt-3 leading-7">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </Card>
  );
}
