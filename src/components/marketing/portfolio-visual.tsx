import Image from "next/image";

import { cn } from "@/lib/utils";

import { JewelryStudy } from "./artwork";
import type { PortfolioProject } from "./content";

export function PortfolioVisual({
  project,
  mode = "card",
  className,
}: {
  project: PortfolioProject;
  mode?: "card" | "detail";
  className?: string;
}) {
  const media = project.media[0];
  if (!media) {
    return (
      <JewelryStudy
        variant={project.artwork}
        className={cn(
          mode === "detail" &&
            "border-ink/10 rounded-[45%_45%_1.5rem_1.5rem] border",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "bg-parchment relative overflow-hidden",
        mode === "card"
          ? "aspect-[4/5]"
          : "border-ink/10 aspect-[4/5] rounded-[45%_45%_1.5rem_1.5rem] border",
        className,
      )}
    >
      <Image
        unoptimized
        src={media.url}
        alt={media.altText}
        width={media.width}
        height={media.height}
        sizes={
          mode === "card"
            ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            : "(max-width: 1024px) 100vw, 48vw"
        }
        className="absolute inset-0 size-full object-cover"
      />
      <span
        aria-hidden="true"
        className="border-porcelain/45 absolute inset-4 border"
      />
    </div>
  );
}
