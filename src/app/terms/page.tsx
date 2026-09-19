import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { createMarketingMetadata } from "@/components/marketing/metadata";
import { PublicContactLink } from "@/components/marketing/public-contact";

export const metadata: Metadata = createMarketingMetadata(
  "Terms of Service Template",
  "A plain-language, non-final terms template for the fictional Veyra Atelier design experience.",
  "/terms",
);

const sections = [
  {
    title: "Using this demonstration",
    content: (
      <p>
        Veyra Atelier is a fictional development brand. The public pages may be
        viewed for demonstration purposes. They do not create a client
        relationship, accept a commission, promise availability, or constitute
        an offer to sell jewelry.
      </p>
    ),
  },
  {
    title: "Accounts and private areas",
    content: (
      <p>
        A future service may require an account for private project tools. Users
        should provide accurate account information, protect access credentials,
        and notify the operator of suspected misuse. Final terms must describe
        actual eligibility, account recovery, and suspension procedures.
      </p>
    ),
  },
  {
    title: "Design engagements",
    content: (
      <p>
        No design engagement begins until both parties accept a project-specific
        written proposal. That proposal should define scope, deliverables,
        review rounds, schedule, fees, production assumptions, ownership and
        permitted use of design work, and how either party may end the
        engagement.
      </p>
    ),
  },
  {
    title: "Materials and production",
    content: (
      <p>
        Concepts shown on this site are not manufacturing specifications or
        guarantees of stone availability, durability, color, valuation, or
        finished appearance. A qualified fabricator should assess inherited
        materials and confirm construction, sourcing, hallmarking, insurance,
        and delivery responsibilities in writing.
      </p>
    ),
  },
  {
    title: "Original work and references",
    content: (
      <p>
        Visitors should not submit material they do not have permission to use
        or ask the atelier to copy another designer’s work. A final client
        agreement should clearly address rights in client-provided materials,
        preliminary studies, approved designs, and any agreed portfolio use.
      </p>
    ),
  },
  {
    title: "Disclaimers, responsibility, and changes",
    content: (
      <p>
        These demonstration pages are provided as-is and may change. Any real
        limitation of liability, warranty language, dispute process, governing
        law, or change-notice mechanism must be tailored and reviewed for the
        operating business rather than copied from this template.
      </p>
    ),
  },
  {
    title: "Contact",
    content: (
      <p>
        Questions about this terms template may be sent to <PublicContactLink />
        . The address and response expectations must be replaced with real
        operational details before launch.
      </p>
    ),
  },
] as const;

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal template / terms"
      title="Terms for a thoughtful working relationship."
      description="A non-final framework separating public inspiration from a real, project-specific design agreement."
      updated="September 17, 2026"
      sections={sections}
    />
  );
}
