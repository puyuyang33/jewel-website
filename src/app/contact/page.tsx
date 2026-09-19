import type { Metadata } from "next";
import {
  CalendarCheck2,
  Clock3,
  Globe2,
  Mail,
  NotebookPen,
  Phone,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { createMarketingMetadata } from "@/components/marketing/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { getPublicSiteSettings } from "@/components/marketing/public-content";
import { PublicContentError } from "@/components/marketing/public-content-state";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = createMarketingMetadata(
  "Contact",
  "Contact the fictional Veyra Atelier studio or begin a private jewelry design brief.",
  "/contact",
);

export default async function ContactPage() {
  const settingsResult = await getPublicSiteSettings();
  const settings = settingsResult.ok ? settingsResult.data.settings : null;
  const hasManagedContact =
    settingsResult.ok && settingsResult.data.source === "database";
  const contactDetails: {
    icon: LucideIcon;
    label: string;
    value: string;
    note: string;
  }[] = settings
    ? [
        {
          icon: Mail,
          label: "Email",
          value: settings.contactEmail,
          note: hasManagedContact
            ? "Published studio contact."
            : "Configuration fallback—replace before a real launch.",
        },
        {
          icon: Clock3,
          label: "Reply rhythm",
          value: "Within two studio days",
          note: "A stated service intention, not a guaranteed response time.",
        },
        {
          icon: Globe2,
          label: "Consultations",
          value: settings.contactLocation,
          note: "Published availability should be confirmed when scheduling.",
        },
        {
          icon: CalendarCheck2,
          label: "New commissions",
          value: settings.intakeOpen
            ? "Open for initial inquiries"
            : "New intake is currently paused",
          note: "This status is published by the atelier.",
        },
      ]
    : [];
  if (settings?.contactPhone) {
    contactDetails.splice(1, 0, {
      icon: Phone,
      label: "Phone",
      value: settings.contactPhone,
      note: "Published studio contact.",
    });
  }

  return (
    <MarketingShell>
      <PageHero
        eyebrow="Contact the atelier"
        title="A considered note is enough."
        description="For general questions, press inquiries, or help deciding whether a commission is the right fit, write to the studio."
        aside={
          <p className="text-stone text-sm leading-6">
            Fictional studio contact
            <br />
            No showroom or public hours
            <br />
            English-language consultations
          </p>
        }
      />

      <section className="section-space">
        <div className="page-shell grid gap-14 lg:grid-cols-[0.72fr_1fr] lg:gap-24">
          <div>
            <SectionHeading
              eyebrow="Write to us"
              title="Tell us what kind of conversation you need."
              description="You do not need to send a polished brief. A few useful facts help the studio respond with care."
            />
            <ul className="text-stone mt-9 space-y-4 text-lg leading-8">
              {[
                "What you are hoping to make or understand",
                "Who the piece is for and any meaningful timing",
                "Whether inherited materials are involved",
                "Your preferred way to continue the conversation",
              ].map((item) => (
                <li key={item} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="bg-garnet mt-3 size-1.5 shrink-0 rotate-45"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {settings ? (
              <Button asChild size="lg" className="mt-10">
                <a
                  href={`mailto:${settings.contactEmail}?subject=Veyra%20Atelier%20inquiry`}
                >
                  <Mail aria-hidden="true" size={18} />
                  Email the studio
                </a>
              </Button>
            ) : null}
          </div>

          <div className="grid gap-5">
            {settingsResult.ok ? (
              contactDetails.map((detail, index) => (
                <Card
                  key={detail.label}
                  className="grid gap-6 p-6 sm:grid-cols-[3rem_1fr_auto] sm:items-center sm:p-8"
                >
                  <span className="border-brass/45 grid size-12 place-items-center rounded-full border">
                    <detail.icon
                      aria-hidden="true"
                      className="text-garnet"
                      size={21}
                      strokeWidth={1.5}
                    />
                  </span>
                  <div>
                    <p className="text-garnet text-xs font-semibold tracking-[0.15em] uppercase">
                      {detail.label}
                    </p>
                    <p className="font-display mt-2 text-2xl">{detail.value}</p>
                    <p className="text-stone mt-2 text-sm leading-6">
                      {detail.note}
                    </p>
                  </div>
                  <span className="text-stone font-mono text-xs">
                    C{String(index + 1).padStart(2, "0")}
                  </span>
                </Card>
              ))
            ) : (
              <PublicContentError message={settingsResult.message} />
            )}
          </div>
        </div>
      </section>

      <section className="border-ink/10 bg-parchment/55 border-y">
        <div className="page-shell grid gap-8 py-14 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <span className="border-brass/50 grid size-14 place-items-center rounded-full border">
            <NotebookPen
              aria-hidden="true"
              className="text-garnet"
              size={24}
              strokeWidth={1.4}
            />
          </span>
          <div>
            <p className="eyebrow">Ready to shape a brief?</p>
            <h2 className="font-display mt-2 text-3xl">
              The private intake begins after sign-in.
            </h2>
            <p className="text-stone mt-3 max-w-2xl leading-7">
              The start page explains what to prepare and why an account is
              required before any commission details are collected.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/start">How to begin</Link>
          </Button>
        </div>
      </section>

      <section className="page-shell text-stone py-12 text-sm leading-6">
        <p>
          Please do not send payment details, identity documents, stone
          certificates, or irreplaceable originals by email. This public page
          does not collect information through a web form.
        </p>
      </section>
    </MarketingShell>
  );
}
