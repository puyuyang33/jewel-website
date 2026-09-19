import type { Metadata } from "next";
import {
  ArrowRight,
  FileLock2,
  Gem,
  NotebookTabs,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { createMarketingMetadata } from "@/components/marketing/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = createMarketingMetadata(
  "Start a Commission",
  "Learn what to prepare for a Veyra Atelier jewelry design inquiry and sign in to begin the private intake.",
  "/start",
);

const preparation = [
  {
    icon: NotebookTabs,
    number: "01",
    title: "The reason",
    text: "A few sentences about the person, moment, memory, or ritual the piece should hold.",
  },
  {
    icon: Gem,
    number: "02",
    title: "The materials",
    text: "Any stones, metal, inherited objects, sensitivities, or strong preferences already known.",
  },
  {
    icon: UserRoundCheck,
    number: "03",
    title: "The realities",
    text: "A budget range, useful timing, daily-wear needs, and the people involved in decisions.",
  },
] as const;

export default function StartPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Start a commission"
        title="Begin privately, with the right context."
        description="Veyra’s design intake sits behind sign-in so a draft can remain connected to the right account and continue across conversations."
        aside={
          <div className="flex gap-4">
            <FileLock2
              aria-hidden="true"
              className="text-garnet mt-0.5 shrink-0"
              size={22}
              strokeWidth={1.5}
            />
            <p className="text-stone text-sm leading-6">
              Sign-in is required before entering or saving commission details.
            </p>
          </div>
        }
      />

      <section className="section-space">
        <div className="page-shell grid gap-14 lg:grid-cols-[0.56fr_1fr] lg:gap-24">
          <div>
            <SectionHeading
              eyebrow="Before you sign in"
              title="Three useful fragments."
              description="There is no need to arrive with a finished design. These are simply anchors for the first conversation."
            />
          </div>
          <ol className="grid gap-5">
            {preparation.map((item) => (
              <li key={item.number}>
                <Card className="grid gap-5 p-6 sm:grid-cols-[3.5rem_1fr_auto] sm:items-center sm:p-8">
                  <span className="border-brass/50 grid size-12 place-items-center rounded-full border">
                    <item.icon
                      aria-hidden="true"
                      className="text-garnet"
                      size={21}
                      strokeWidth={1.45}
                    />
                  </span>
                  <div>
                    <h2 className="font-display text-3xl">{item.title}</h2>
                    <p className="text-stone mt-3 leading-7">{item.text}</p>
                  </div>
                  <span className="text-garnet font-mono text-xs">
                    {item.number}
                  </span>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-ink text-porcelain">
        <div className="page-shell grid gap-10 py-16 lg:grid-cols-[1fr_auto] lg:items-center lg:py-20">
          <div>
            <p className="text-parchment text-xs font-bold tracking-[0.18em] uppercase">
              Private intake
            </p>
            <h2 className="font-display mt-4 max-w-3xl text-4xl leading-tight sm:text-6xl">
              Sign in to open your design brief.
            </h2>
            <p className="text-porcelain/75 mt-5 max-w-2xl text-lg leading-8">
              This public page does not collect commission details. Continue to
              the account sign-in to access the private workspace.
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="bg-porcelain text-ink hover:bg-parchment focus-visible:outline-porcelain"
          >
            <Link href="/sign-in">
              Continue to sign in
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </Button>
        </div>
      </section>

      <section className="page-shell grid gap-8 py-14 text-sm leading-6 sm:grid-cols-3">
        <div>
          <p className="text-ink font-semibold">No payment at this stage</p>
          <p className="text-stone mt-2">
            Signing in starts a brief; it does not place an order or authorize a
            charge.
          </p>
        </div>
        <div>
          <p className="text-ink font-semibold">Keep sensitive records back</p>
          <p className="text-stone mt-2">
            Do not upload identity documents, payment credentials, or
            irreplaceable originals.
          </p>
        </div>
        <div>
          <p className="text-ink font-semibold">Review the framework</p>
          <p className="text-stone mt-2">
            Read the{" "}
            <Link
              href="/privacy"
              className="text-garnet underline underline-offset-4"
            >
              privacy template
            </Link>{" "}
            and{" "}
            <Link
              href="/terms"
              className="text-garnet underline underline-offset-4"
            >
              terms template
            </Link>{" "}
            before continuing.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
