import type { Metadata } from "next";
import { Compass, Feather, Scale } from "lucide-react";
import Link from "next/link";

import { JewelryStudy } from "@/components/marketing/artwork";
import { CallToAction } from "@/components/marketing/call-to-action";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import styles from "@/components/marketing/marketing.module.css";
import { createMarketingMetadata } from "@/components/marketing/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = createMarketingMetadata(
  "About the Atelier",
  "Meet the fictional designer and considered principles behind Veyra Atelier’s private jewelry design practice.",
  "/about",
);

const principles = [
  {
    icon: Feather,
    number: "I",
    title: "Restraint reveals",
    text: "A detail earns its place by carrying meaning, improving wear, or clarifying the whole.",
  },
  {
    icon: Compass,
    number: "II",
    title: "Context is material",
    text: "A person’s habits, rituals, and memories shape the design as surely as metal or stone.",
  },
  {
    icon: Scale,
    number: "III",
    title: "Precision creates ease",
    text: "Careful decisions early make the finished object feel inevitable rather than overworked.",
  },
] as const;

export default function AboutPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="About Veyra"
        title="An atelier shaped by attention."
        description="Veyra imagines jewelry as a form of close reading: of a person, an inheritance, a ritual, and the way an object will move through daily life."
        aside={
          <p className="text-stone text-sm leading-6">
            Fictional founder profile
            <br />
            Independent practice
            <br />
            By appointment, worldwide
          </p>
        }
      />

      <section className="section-space">
        <div className="page-shell grid items-center gap-14 lg:grid-cols-[0.8fr_1fr] lg:gap-24">
          <div className="relative mx-auto w-full max-w-md">
            <JewelryStudy
              variant="relic"
              className="border-ink/10 rounded-[45%_45%_1.5rem_1.5rem] border"
            />
            <div className="border-brass/40 bg-porcelain absolute -bottom-5 left-5 border px-5 py-3 text-xs font-semibold tracking-[0.13em] uppercase shadow-lg sm:left-[-2rem]">
              Portrait through objects / 01
            </div>
          </div>
          <div>
            <SectionHeading
              eyebrow="Elena Veyra / fictional designer"
              title="The hand behind the line."
            />
            <div className="text-stone mt-8 space-y-6 text-lg leading-8">
              <p>
                Elena Veyra is a fictional creative persona made for this
                demonstration experience. Her imagined practice sits between the
                jeweler’s bench and the editor’s desk: gathering fragments,
                finding the essential line, and making every decision readable.
              </p>
              <p>
                The atelier’s point of view is quiet but not neutral. It favors
                low profiles, purposeful asymmetry, generous negative space,
                warm metal, and stones selected for character rather than
                uniformity.
              </p>
            </div>
            <div className={styles.signature} aria-hidden="true" />
            <Button asChild variant="secondary">
              <Link href="/process">See the working method</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className={`${styles.inkPanel} text-porcelain`}>
        <div className="page-shell py-20 text-center sm:py-28">
          <p className="text-parchment text-xs font-bold tracking-[0.18em] uppercase">
            Atelier note / no. 07
          </p>
          <blockquote className="font-display mx-auto mt-8 max-w-5xl text-4xl leading-tight tracking-[-0.035em] text-balance sm:text-6xl">
            “A jewel can be small in scale and still hold an entire architecture
            of memory.”
          </blockquote>
        </div>
      </section>

      <section className="section-space">
        <div className="page-shell">
          <SectionHeading
            eyebrow="Working principles"
            title="Three measures for every idea."
          />
          <ol className="border-ink/15 mt-14 grid border-t lg:grid-cols-3">
            {principles.map((principle, index) => (
              <li
                key={principle.title}
                className={`py-8 lg:px-8 ${
                  index > 0
                    ? "border-ink/15 border-t lg:border-t-0 lg:border-l"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <principle.icon
                    aria-hidden="true"
                    className="text-garnet"
                    size={28}
                    strokeWidth={1.4}
                  />
                  <span className="font-display text-brass text-2xl">
                    {principle.number}
                  </span>
                </div>
                <h3 className="font-display mt-12 text-3xl">
                  {principle.title}
                </h3>
                <p className="text-stone mt-5 leading-7">{principle.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-ink/10 bg-parchment/45 border-t">
        <div className="page-shell grid gap-8 py-16 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="eyebrow">A transparent fiction</p>
            <h2 className="font-display mt-3 text-3xl sm:text-4xl">
              This atelier is an original demonstration brand.
            </h2>
            <p className="text-stone mt-4 max-w-2xl leading-7">
              The identity, designer biography, portfolio, and testimonials are
              fictional. They exist to demonstrate a complete public marketing
              experience without borrowing a real maker’s story or imagery.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/contact">Contact the studio</Link>
          </Button>
        </div>
      </section>

      <CallToAction
        title="A small object can begin with a long conversation."
        description="If the atelier’s way of thinking feels right, begin with the story you want the piece to hold."
      />
    </MarketingShell>
  );
}
