import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import styles from "./marketing.module.css";

export function PageHero({
  eyebrow,
  title,
  description,
  aside,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        styles.paperField,
        "border-ink/10 border-b py-20 sm:py-24 lg:py-32",
        className,
      )}
    >
      <div className="page-shell grid items-end gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.42fr)]">
        <div className="max-w-4xl">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display-title mt-5 text-balance">{title}</h1>
          <p className="text-stone mt-8 max-w-2xl text-xl leading-8">
            {description}
          </p>
        </div>
        {aside ? (
          <aside className="border-brass/45 border-l pl-6">{aside}</aside>
        ) : (
          <p className="border-brass/45 text-stone border-l pl-6 text-sm leading-6">
            Private commissions
            <br />
            Designed by conversation
            <br />
            Available worldwide
          </p>
        )}
      </div>
    </section>
  );
}
