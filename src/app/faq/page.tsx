import type { Metadata } from "next";
import Link from "next/link";

import { commonFaqs } from "@/components/marketing/content";
import { FaqList } from "@/components/marketing/faq-list";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { createMarketingMetadata } from "@/components/marketing/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = createMarketingMetadata(
  "Frequently Asked Questions",
  "Practical answers about Veyra Atelier commissions, inherited materials, timelines, privacy, and production scope.",
  "/faq",
);

const practicalFaqs = [
  {
    question: "Are the portfolio pieces available to purchase?",
    answer:
      "No. The public portfolio is a fictional editorial archive showing original concept directions. It is not an inventory, and the studies are not offered as templates to reproduce for another client.",
  },
  {
    question: "Does the design fee include fabrication?",
    answer:
      "Not by default. The design phase and its deliverables should be quoted clearly before work begins. Fabrication, sourcing, certification, taxes, insurance, and shipping require separate written estimates.",
  },
  {
    question: "How are consultations held?",
    answer:
      "The demonstration experience assumes a private video conversation followed by written reviews. Any real launch should publish its actual availability, time zone, accessibility options, and response times.",
  },
  {
    question: "What happens if the timing changes?",
    answer:
      "The atelier and client should agree on a revised schedule in writing. Production deadlines involving proposals, ceremonies, or travel should include contingency time and should never be implied until a maker confirms them.",
  },
] as const;

export default function FaqPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Frequently asked"
        title="Useful clarity, before we begin."
        description="Questions about the design relationship, the limits of the service, and what a thoughtful commission asks of both sides."
        aside={
          <p className="text-stone text-sm leading-6">
            Still wondering?
            <br />
            <Link
              href="/contact"
              className="text-garnet font-semibold underline underline-offset-4"
            >
              Write to the atelier
            </Link>
          </p>
        }
      />

      <section className="section-space">
        <div className="page-shell grid gap-12 lg:grid-cols-[0.42fr_1fr]">
          <div>
            <SectionHeading
              eyebrow="The commission"
              title="About the work."
              description="The essentials of fit, timing, scope, and collaboration."
            />
          </div>
          <FaqList items={commonFaqs} />
        </div>
      </section>

      <section className="border-ink/10 bg-parchment/50 border-y py-16 lg:py-24">
        <div className="page-shell grid gap-12 lg:grid-cols-[0.42fr_1fr]">
          <div>
            <SectionHeading
              eyebrow="Practical details"
              title="About the edges."
              description="Availability, fees, production, and changing plans."
            />
          </div>
          <FaqList items={practicalFaqs} startAt={7} />
        </div>
      </section>

      <section className="page-shell py-16 text-center sm:py-20">
        <p className="eyebrow">A question unique to your piece?</p>
        <h2 className="font-display mx-auto mt-4 max-w-2xl text-4xl leading-tight sm:text-5xl">
          Not every useful answer belongs in a list.
        </h2>
        <p className="text-stone mx-auto mt-5 max-w-xl text-lg leading-8">
          Send a concise note and the studio can help identify the right next
          conversation.
        </p>
        <Button asChild className="mt-8">
          <Link href="/contact">Contact the atelier</Link>
        </Button>
      </section>
    </MarketingShell>
  );
}
