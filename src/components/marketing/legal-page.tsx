import type { ReactNode } from "react";
import Link from "next/link";

import { MarketingShell } from "./marketing-shell";
import { PageHero } from "./page-hero";

export interface LegalSection {
  readonly title: string;
  readonly content: ReactNode;
}

const policyLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/payment-cancellation", label: "Payments & cancellation" },
] as const;

export function LegalPage({
  eyebrow,
  title,
  description,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updated: string;
  sections: readonly LegalSection[];
}) {
  return (
    <MarketingShell>
      <PageHero
        eyebrow={eyebrow}
        title={title}
        description={description}
        aside={
          <p className="text-stone text-sm leading-6">
            Template notice
            <br />
            Last updated {updated}
          </p>
        }
      />
      <div className="page-shell grid gap-12 py-16 lg:grid-cols-[15rem_minmax(0,48rem)] lg:justify-between lg:py-24">
        <aside>
          <nav
            aria-label="Policy pages"
            className="border-ink/15 sticky top-28 grid gap-2 border-l pl-5 text-sm"
          >
            {policyLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-stone hover:text-garnet focus-visible:outline-garnet flex min-h-11 items-center rounded-sm py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </aside>
        <article className="min-w-0">
          <div className="border-garnet/25 bg-garnet/[0.045] border p-5 text-sm leading-6">
            <strong className="font-semibold">
              Important template notice.
            </strong>{" "}
            Veyra Atelier is a fictional development brand. This page is a
            plain-language starting point, not legal advice or a claim of
            regulatory compliance. A real operator should replace it with terms
            reviewed for its business, location, and actual data practices.
          </div>
          <div className="mt-12 space-y-12">
            {sections.map((section, index) => (
              <section
                key={section.title}
                aria-labelledby={`legal-section-${index}`}
              >
                <p className="text-garnet font-mono text-xs tracking-[0.16em]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h2
                  id={`legal-section-${index}`}
                  className="font-display mt-3 text-3xl sm:text-4xl"
                >
                  {section.title}
                </h2>
                <div className="text-stone [&_a]:text-garnet [&_strong]:text-ink mt-5 space-y-4 text-base leading-7 [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-2 [&_strong]:font-semibold [&_ul]:list-outside [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                  {section.content}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </MarketingShell>
  );
}
