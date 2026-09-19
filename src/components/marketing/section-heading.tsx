import type { ElementType } from "react";

import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  as: Heading = "h2",
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  as?: ElementType;
}) {
  return (
    <div className={cn(align === "center" && "mx-auto max-w-3xl text-center")}>
      <p className="eyebrow">{eyebrow}</p>
      <Heading className="section-title mt-4 text-balance">{title}</Heading>
      {description ? (
        <p
          className={cn(
            "text-stone mt-6 max-w-2xl text-lg leading-8",
            align === "center" && "mx-auto",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
