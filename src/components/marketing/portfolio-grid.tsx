import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { PortfolioProject } from "./content";
import styles from "./marketing.module.css";
import { PortfolioVisual } from "./portfolio-visual";

export function PortfolioGrid({
  projects,
  compact = false,
}: {
  projects: readonly PortfolioProject[];
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-6",
        compact ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {projects.map((project, index) => (
        <article
          key={project.id}
          className={cn(
            styles.studyGroup,
            !compact && index % 3 === 1 && "lg:translate-y-12",
          )}
        >
          <Card className="group bg-porcelain overflow-hidden rounded-[2rem]">
            <PortfolioVisual project={project} />
            <div className="p-6 sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <Badge>{project.category}</Badge>
                <span className="text-stone text-xs tracking-[0.16em]">
                  {project.year}
                </span>
              </div>
              <h3 className="font-display mt-5 text-3xl leading-none">
                <Link
                  href={`/portfolio/${project.slug}`}
                  className="focus-visible:outline-garnet rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                  {project.title}
                </Link>
              </h3>
              <p className="text-stone mt-4 leading-7">{project.excerpt}</p>
              {!compact ? (
                <dl className="border-ink/10 mt-6 grid gap-3 border-t pt-5 text-sm">
                  <div className="grid grid-cols-[5rem_1fr] gap-3">
                    <dt className="text-stone">Materials</dt>
                    <dd>{project.materials.join(", ") || "To be confirmed"}</dd>
                  </div>
                  <div className="grid grid-cols-[5rem_1fr] gap-3">
                    <dt className="text-stone">Techniques</dt>
                    <dd>
                      {project.techniques.join(", ") || "To be confirmed"}
                    </dd>
                  </div>
                </dl>
              ) : null}
              <Link
                href={`/portfolio/${project.slug}`}
                className="text-garnet border-garnet focus-visible:outline-garnet mt-6 inline-flex items-center gap-2 rounded-sm border-b pb-0.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                Read the study
                <ArrowUpRight aria-hidden="true" size={15} />
              </Link>
            </div>
          </Card>
        </article>
      ))}
    </div>
  );
}
