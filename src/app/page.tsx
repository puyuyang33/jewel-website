import type { Metadata } from "next";
import {
  ArrowDownRight,
  ArrowUpRight,
  Gem,
  Hammer,
  Recycle,
  ScanLine,
} from "lucide-react";
import Link from "next/link";

import { HeroJewelryStudy, JewelryStudy } from "@/components/marketing/artwork";
import { CallToAction } from "@/components/marketing/call-to-action";
import {
  commonFaqs,
  fictionalTestimonials,
  processSteps,
  type PortfolioCategory,
} from "@/components/marketing/content";
import { FaqList } from "@/components/marketing/faq-list";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { createMarketingMetadata } from "@/components/marketing/metadata";
import { PortfolioGrid } from "@/components/marketing/portfolio-grid";
import {
  getPublicPortfolioContent,
  getPublicSiteSettings,
} from "@/components/marketing/public-content";
import {
  EmptyPortfolio,
  PublicContentError,
} from "@/components/marketing/public-content-state";
import { SectionHeading } from "@/components/marketing/section-heading";
import styles from "@/components/marketing/marketing.module.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brand } from "@/config/brand";

export const metadata: Metadata = createMarketingMetadata(
  "Private Jewelry Design",
  "Original one-of-one jewelry concepts shaped through conversation, material study, and precise design documentation.",
  "/",
);

const categoryNotes: Record<PortfolioCategory, string> = {
  Rings: "Personal scale, architectural profile.",
  Necklaces: "A line, weight, and rhythm held close.",
  Earrings: "Pairs that converse rather than repeat.",
  Ceremonial: "Marks of commitment without convention.",
  Objects: "Small talismans with a private purpose.",
  Uncategorized: "A study awaiting a more specific editorial grouping.",
};

const materialPrinciples = [
  {
    icon: Recycle,
    title: "Material with a past",
    description:
      "Reclaimed metal and inherited stones are treated as design constraints with meaning, never as shortcuts.",
  },
  {
    icon: ScanLine,
    title: "Proportion before ornament",
    description:
      "Profile, balance, closure, and touch are resolved before surface detail enters the drawing.",
  },
  {
    icon: Hammer,
    title: "Made for a maker",
    description:
      "Concepts are developed with real construction in mind and documented for a fabrication conversation.",
  },
  {
    icon: Gem,
    title: "Stones with character",
    description:
      "Shape, inclusion, origin story, and setting logic matter more than a generic hierarchy of perfection.",
  },
] as const;

export default async function Home() {
  const [portfolio, settings] = await Promise.all([
    getPublicPortfolioContent(),
    getPublicSiteSettings(),
  ]);

  return (
    <MarketingShell>
      <div className="border-ink/10 bg-ink text-porcelain border-b">
        <ul
          aria-label="Atelier principles"
          className="page-shell grid min-h-11 grid-cols-1 items-center gap-x-8 py-2 text-center text-[0.68rem] font-semibold tracking-[0.14em] uppercase sm:grid-cols-3 sm:text-left"
        >
          <li>Private by design</li>
          <li className="hidden text-center sm:list-item">
            One commission at a time
          </li>
          <li className="hidden text-right sm:list-item">
            Documented provenance
          </li>
        </ul>
      </div>

      <section
        className={`${styles.paperField} border-ink/10 overflow-hidden border-b`}
      >
        <div className="page-shell grid min-h-[calc(100svh-7.75rem)] items-center gap-14 py-16 lg:grid-cols-[1.08fr_0.72fr] lg:py-20">
          <div className="relative z-10">
            <Badge>
              {settings.ok
                ? `${settings.data.settings.brandName} · independent design atelier`
                : "Studio identity temporarily unavailable"}
            </Badge>
            <h1 className="display-title mt-7 max-w-5xl text-balance">
              Jewelry, composed around a{" "}
              <em className="text-garnet font-normal">life.</em>
            </h1>
            <div className="border-brass/55 mt-8 grid gap-7 border-l pl-6 sm:grid-cols-[minmax(0,34rem)_auto] sm:items-end">
              <p className="text-stone max-w-xl text-xl leading-8">
                {brand.description}
              </p>
              <span
                aria-hidden="true"
                className="font-display text-brass hidden text-5xl sm:block"
              >
                01
              </span>
            </div>
            {!settings.ok ? (
              <p
                role="status"
                className="border-garnet/30 bg-garnet/[0.045] text-stone mt-6 max-w-xl border px-4 py-3 text-sm leading-6"
              >
                {settings.message}
              </p>
            ) : null}
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/start">
                  Begin a commission
                  <ArrowUpRight aria-hidden="true" size={18} />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/portfolio">
                  View selected work
                  <ArrowDownRight aria-hidden="true" size={18} />
                </Link>
              </Button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-lg lg:translate-x-5">
            <HeroJewelryStudy />
          </div>
        </div>
      </section>

      <section
        className="section-space overflow-hidden"
        aria-labelledby="selected-work"
      >
        <div className="page-shell">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div id="selected-work">
              <SectionHeading
                eyebrow="Selected portfolio"
                title="Studies in memory and material."
                description={
                  portfolio.ok && portfolio.data.source === "database"
                    ? "Published projects from the atelier archive, ordered as selected by the studio."
                    : "Original fictional concepts from the Veyra editorial archive, presented to show the atelier’s design language."
                }
              />
            </div>
            <Link
              href="/portfolio"
              className="group border-garnet text-garnet focus-visible:outline-garnet inline-flex w-fit items-center gap-2 rounded-sm border-b pb-1 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              Explore the archive
              <ArrowUpRight
                aria-hidden="true"
                size={17}
                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
          </div>
          <div className="mt-14 lg:mb-12">
            {portfolio.ok ? (
              portfolio.data.projects.length > 0 ? (
                <>
                  {portfolio.data.source === "development-fallback" ? (
                    <p className="border-brass/40 text-stone mb-6 border-l pl-4 text-sm leading-6">
                      Development fallback: Supabase is not configured, so this
                      preview uses Veyra’s original fictional concept studies.
                    </p>
                  ) : null}
                  <PortfolioGrid
                    projects={portfolio.data.projects.slice(0, 3)}
                    compact
                  />
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

      <section className="border-ink/10 bg-parchment/55 border-y">
        <div className="page-shell grid lg:grid-cols-[0.7fr_1.3fr]">
          <div className="border-ink/10 border-b py-14 lg:border-r lg:border-b-0 lg:py-20 lg:pr-16">
            <p className="eyebrow">Forms we explore</p>
            <h2 className="font-display mt-4 max-w-sm text-5xl leading-none tracking-[-0.04em]">
              A vocabulary, not a catalogue.
            </h2>
            <p className="text-stone mt-6 max-w-sm leading-7">
              Each category is a starting point. The commission finds its own
              scale, rhythm, and reason.
            </p>
          </div>
          <ol className="divide-ink/10 divide-y py-6 lg:pl-16">
            {brand.portfolioCategories.map((category, index) => (
              <li
                key={category}
                className="group grid grid-cols-[2.5rem_1fr] gap-4 py-5 sm:grid-cols-[3rem_0.6fr_1fr] sm:items-baseline"
              >
                <span className="text-garnet font-mono text-xs">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="font-display text-3xl transition-transform duration-300 group-hover:translate-x-1 sm:text-4xl">
                  {category}
                </span>
                <span className="text-stone col-start-2 text-sm leading-6 sm:col-start-3">
                  {categoryNotes[category]}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section-space">
        <div className="page-shell grid items-center gap-14 lg:grid-cols-[0.78fr_1fr] lg:gap-24">
          <div className="relative mx-auto w-full max-w-md">
            <JewelryStudy
              variant="signet"
              className="border-ink/10 rounded-t-[50%] border"
            />
            <div className="border-brass/40 bg-porcelain absolute -right-3 -bottom-5 max-w-52 border p-5 shadow-xl sm:-right-8">
              <p className="font-display text-garnet text-4xl">E.V.</p>
              <p className="mt-2 text-xs font-semibold tracking-[0.13em] uppercase">
                Form follows meaning
              </p>
            </div>
          </div>
          <div>
            <SectionHeading
              eyebrow="The designer"
              title="A listening practice, expressed in line."
              description="Elena Veyra is the fictional founder and designer behind this demonstration atelier—an editorial persona shaped around patient inquiry, exacting proportion, and an affection for materials that carry history."
            />
            <blockquote className="border-garnet font-display mt-9 border-l pl-6 text-2xl leading-snug italic">
              “The first drawing is never of the jewel. It is of the
              relationship the jewel must hold.”
            </blockquote>
            <Button asChild variant="secondary" className="mt-9">
              <Link href="/about">Meet the atelier</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className={`${styles.inkPanel} section-space text-porcelain`}>
        <div className="page-shell">
          <div className="[&_.eyebrow]:text-parchment [&_.section-title]:text-porcelain [&_p]:text-porcelain/72">
            <SectionHeading
              eyebrow="Commission process"
              title="Clarity at every turn."
              description="A deliberate sequence keeps the emotional work expansive and the practical decisions visible."
            />
          </div>
          <ol className="border-porcelain/15 bg-porcelain/15 mt-14 grid gap-px overflow-hidden border md:grid-cols-2 lg:grid-cols-5">
            {processSteps.map((step) => (
              <li
                key={step.number}
                className="bg-ink min-h-72 p-6 transition-colors hover:bg-[#2a2722]"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-display text-brass text-4xl">
                    {step.number}
                  </span>
                  <span className="text-porcelain/65 text-[0.65rem] tracking-[0.13em] uppercase">
                    {step.duration}
                  </span>
                </div>
                <h3 className="font-display mt-12 text-2xl leading-tight">
                  {step.title}
                </h3>
                <p className="text-porcelain/68 mt-4 text-sm leading-6">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
          <Button
            asChild
            variant="secondary"
            className="border-porcelain/35 text-porcelain hover:bg-porcelain hover:text-ink mt-8 bg-transparent"
          >
            <Link href="/process">See how a commission unfolds</Link>
          </Button>
        </div>
      </section>

      <section className="section-space border-ink/10 border-b">
        <div className="page-shell">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <SectionHeading
              eyebrow="Materials & craft"
              title="Nothing arbitrary. Nothing merely applied."
            />
            <p className="text-stone max-w-2xl text-lg leading-8 lg:justify-self-end">
              Material is not a finish added at the end. Its weight, origin,
              limits, and future care shape the idea from the first line.
            </p>
          </div>
          <div className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {materialPrinciples.map((principle, index) => (
              <article
                key={principle.title}
                className="border-ink/20 border-t pt-6"
              >
                <div className="flex items-center justify-between">
                  <principle.icon
                    aria-hidden="true"
                    className="text-garnet"
                    strokeWidth={1.35}
                    size={29}
                  />
                  <span className="text-stone font-mono text-xs">
                    M{String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="font-display mt-8 text-2xl leading-tight">
                  {principle.title}
                </h3>
                <p className="text-stone mt-4 leading-7">
                  {principle.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-space bg-parchment/45">
        <div className="page-shell">
          <SectionHeading
            eyebrow="Fictional client vignettes"
            title="What the process is designed to feel like."
            description="The quotes below are clearly labeled fictional placeholders created for this development brand; they are not real customer endorsements."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {fictionalTestimonials.map((testimonial, index) => (
              <Card
                key={testimonial.attribution}
                className="relative overflow-hidden p-7 sm:p-10"
              >
                <p className="eyebrow">Fictional testimonial</p>
                <span
                  aria-hidden="true"
                  className="font-display text-brass/15 absolute top-2 right-7 text-8xl leading-none"
                >
                  “
                </span>
                <blockquote className="font-display relative mt-8 text-3xl leading-snug">
                  “{testimonial.quote}”
                </blockquote>
                <div className="border-ink/10 mt-9 flex items-end justify-between gap-6 border-t pt-5">
                  <div>
                    <p className="font-semibold">{testimonial.attribution}</p>
                    <p className="text-stone mt-1 text-sm">
                      {testimonial.project}
                    </p>
                  </div>
                  <span className="text-garnet font-mono text-xs">
                    0{index + 1}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section-space">
        <div className="page-shell grid gap-12 lg:grid-cols-[0.55fr_1fr]">
          <div>
            <SectionHeading
              eyebrow="Questions, considered"
              title="Before the first line."
              description="A few practical answers about a private design commission."
            />
            <Link
              href="/faq"
              className="border-garnet text-garnet focus-visible:outline-garnet mt-8 inline-flex rounded-sm border-b pb-1 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              Read all questions
            </Link>
          </div>
          <FaqList items={commonFaqs.slice(0, 4)} />
        </div>
      </section>

      <CallToAction />
    </MarketingShell>
  );
}
