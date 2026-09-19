import type { Metadata } from "next";
import {
  Check,
  FileText,
  MessageCircle,
  Ruler,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { CallToAction } from "@/components/marketing/call-to-action";
import { processSteps } from "@/components/marketing/content";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import styles from "@/components/marketing/marketing.module.css";
import { createMarketingMetadata } from "@/components/marketing/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = createMarketingMetadata(
  "Commission Process",
  "See the clear, collaborative stages behind a private Veyra Atelier jewelry design commission.",
  "/process",
);

const reviewPromises = [
  {
    icon: MessageCircle,
    title: "One clear question at a time",
    text: "Reviews are structured around decisions you can actually make, with context for every recommendation.",
  },
  {
    icon: FileText,
    title: "A visible record",
    text: "Approved direction, open questions, and material assumptions are captured rather than left to memory.",
  },
  {
    icon: Ruler,
    title: "Scale made legible",
    text: "Profiles and proportions are shown with dimensions and wear in mind, not only as atmospheric imagery.",
  },
  {
    icon: ShieldCheck,
    title: "Consent around the story",
    text: "Personal context is used to design the piece, not presumed available for publication.",
  },
] as const;

export default function ProcessPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="The commission process"
        title="Measured, open, and deeply personal."
        description="A private commission moves through five deliberate stages. Each has a purpose, a tangible outcome, and a moment for your approval."
        aside={
          <p className="text-stone text-sm leading-6">
            Typical design phase
            <br />
            <strong className="font-display text-ink text-3xl font-normal">
              4–6 weeks
            </strong>
            <br />
            Production quoted separately
          </p>
        }
      />

      <section className="section-space">
        <div className="page-shell grid gap-14 lg:grid-cols-[0.48fr_1fr]">
          <div>
            <SectionHeading
              eyebrow="From story to specification"
              title="Five pauses, not a conveyor belt."
              description="The sequence creates room to think while keeping scope and decisions precise."
            />
          </div>
          <ol className={`${styles.processRail} space-y-12`}>
            {processSteps.map((step) => (
              <li
                key={step.number}
                className="relative grid gap-5 pl-14 sm:grid-cols-[0.62fr_1fr] sm:gap-10"
              >
                <span className="border-brass bg-porcelain text-garnet absolute top-0 left-0 z-10 grid size-9 place-items-center rounded-full border font-mono text-[0.65rem]">
                  {step.number}
                </span>
                <div>
                  <p className="text-garnet text-xs font-semibold tracking-[0.14em] uppercase">
                    {step.duration}
                  </p>
                  <h3 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">
                    {step.title}
                  </h3>
                </div>
                <p className="border-ink/15 text-stone border-t pt-4 text-lg leading-8">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-ink/10 bg-parchment/55 border-y py-16 lg:py-24">
        <div className="page-shell">
          <SectionHeading
            eyebrow="At every review"
            title="You should know what is changing—and why."
            description="Good collaboration is not a reveal at the end. It is a series of well-framed choices."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {reviewPromises.map((promise) => (
              <Card key={promise.title} className="p-6">
                <promise.icon
                  aria-hidden="true"
                  className="text-garnet"
                  size={27}
                  strokeWidth={1.4}
                />
                <h3 className="font-display mt-9 text-2xl leading-tight">
                  {promise.title}
                </h3>
                <p className="text-stone mt-4 leading-7">{promise.text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section-space">
        <div className="page-shell grid gap-12 lg:grid-cols-2 lg:gap-24">
          <div>
            <p className="eyebrow">Useful at the start</p>
            <h2 className="font-display mt-4 text-4xl sm:text-5xl">
              Bring fragments.
            </h2>
            <ul className="mt-8 space-y-4">
              {[
                "The person, relationship, or moment behind the piece",
                "Any inherited stones, metal, or objects under consideration",
                "A practical budget range and desired timing",
                "Notes on daily wear, scale, comfort, and sensitivities",
              ].map((item) => (
                <li key={item} className="text-stone flex gap-3 leading-7">
                  <Check
                    aria-hidden="true"
                    className="text-garnet mt-1 shrink-0"
                    size={18}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border-brass/45 border-l pl-8">
            <p className="eyebrow">Not required</p>
            <h2 className="font-display mt-4 text-4xl sm:text-5xl">
              Leave room for discovery.
            </h2>
            <p className="text-stone mt-8 text-lg leading-8">
              You do not need a finished idea, a mood board, or fluency in
              gemstones. A clear reason for making the piece is enough to begin.
              References are welcomed as clues, never as designs to copy.
            </p>
            <Button asChild variant="secondary" className="mt-8">
              <Link href="/faq">Read practical questions</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-ink/10 border-t">
        <div className="page-shell text-stone grid gap-6 py-10 text-sm leading-6 sm:grid-cols-[auto_1fr]">
          <span className="eyebrow">Scope note</span>
          <p className="max-w-3xl">
            Design services do not by themselves include fabrication, stone
            certification, appraisal, insurance, hallmarking, or delivery. Those
            services and responsibilities must be confirmed in a
            project-specific agreement with the relevant maker or supplier.
          </p>
        </div>
      </section>

      <CallToAction
        title="Start with what matters—not what it should look like."
        description="The first conversation is for context, questions, and fit. No polished brief required."
      />
    </MarketingShell>
  );
}
