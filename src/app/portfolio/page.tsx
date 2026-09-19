import type { Metadata } from "next";
import { ArrowDown } from "lucide-react";

import { CallToAction } from "@/components/marketing/call-to-action";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { createMarketingMetadata } from "@/components/marketing/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { PortfolioGrid } from "@/components/marketing/portfolio-grid";
import { getPublicPortfolioContent } from "@/components/marketing/public-content";
import {
  EmptyPortfolio,
  PublicContentError,
} from "@/components/marketing/public-content-state";
import { SectionHeading } from "@/components/marketing/section-heading";

export const metadata: Metadata = createMarketingMetadata(
  "Portfolio",
  "Explore published original jewelry studies in rings, necklaces, earrings, ceremonial pieces, and objects.",
  "/portfolio",
);

const archiveNotes = [
  {
    number: "A",
    title: "Concept, not catalogue",
    text: "Every study begins with a distinct brief. The archive demonstrates an approach, not a set of designs to reproduce.",
  },
  {
    number: "B",
    title: "Material is specific",
    text: "Metals and stones shown here are narrative design choices. Availability, suitability, and price require a separate production review.",
  },
  {
    number: "C",
    title: "Privacy remains possible",
    text: "A private commission does not need to enter the public archive. Publication would always be a separate conversation.",
  },
] as const;

export default async function PortfolioPage() {
  const portfolio = await getPublicPortfolioContent();

  return (
    <MarketingShell>
      <PageHero
        eyebrow="Portfolio / concept archive"
        title="Objects with an inner logic."
        description="A curated set of original jewelry studies—each built from a story, then resolved through proportion, material, and wear."
        aside={
          <div className="flex items-end justify-between gap-6">
            <p className="text-stone text-sm leading-6">
              {portfolio.ok
                ? `${portfolio.data.projects.length} published ${portfolio.data.projects.length === 1 ? "study" : "studies"}`
                : "Archive status unavailable"}
              <br />
              Stable studio ordering
              <br />
              No client records
            </p>
            <ArrowDown aria-hidden="true" className="text-garnet" size={22} />
          </div>
        }
      />

      <section className="section-space" aria-labelledby="portfolio-grid-title">
        <div className="page-shell">
          <div className="grid gap-8 lg:grid-cols-[0.55fr_1fr] lg:items-end">
            <div id="portfolio-grid-title">
              <SectionHeading
                eyebrow="The archive"
                title="Six studies, no repetitions."
              />
            </div>
            <p className="text-stone max-w-2xl text-lg leading-8 lg:justify-self-end">
              Published portfolio records are read anonymously under database
              policies and remain intentionally separate from private commission
              data.
            </p>
          </div>
          <div className="mt-16 lg:pb-12">
            {portfolio.ok ? (
              portfolio.data.projects.length > 0 ? (
                <>
                  {portfolio.data.source === "development-fallback" ? (
                    <p className="border-brass/40 text-stone mb-8 border-l pl-4 text-sm leading-6">
                      Development fallback: Supabase is not configured, so this
                      build uses Veyra’s original fictional studies rather than
                      database content.
                    </p>
                  ) : null}
                  <PortfolioGrid projects={portfolio.data.projects} />
                </>
              ) : (
                <EmptyPortfolio />
              )
            ) : (
              <PublicContentError message={portfolio.message} />
            )}
          </div>
        </div>
      </section>

      <section className="border-ink/10 bg-parchment/50 border-y">
        <div className="page-shell grid lg:grid-cols-[0.62fr_1.38fr]">
          <div className="lg:border-ink/10 py-14 lg:border-r lg:py-20 lg:pr-14">
            <p className="eyebrow">Reading the work</p>
            <h2 className="font-display mt-4 text-4xl leading-tight sm:text-5xl">
              An archive of decisions.
            </h2>
          </div>
          <ol className="divide-ink/10 grid divide-y lg:pl-14">
            {archiveNotes.map((note) => (
              <li
                key={note.number}
                className="grid gap-4 py-8 sm:grid-cols-[2.5rem_0.55fr_1fr] sm:items-baseline"
              >
                <span className="font-display text-garnet text-2xl">
                  {note.number}
                </span>
                <h3 className="font-display text-2xl">{note.title}</h3>
                <p className="text-stone leading-7">{note.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CallToAction
        eyebrow="Your piece does not live here yet"
        title="Let the next study begin with you."
        description="Share the story, object, stone, or occasion that has been waiting for a form."
      />
    </MarketingShell>
  );
}
