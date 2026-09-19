import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { createMarketingMetadata } from "@/components/marketing/metadata";
import { PublicContactLink } from "@/components/marketing/public-contact";

export const metadata: Metadata = createMarketingMetadata(
  "Privacy Notice Template",
  "A plain-language, non-final privacy notice template for the fictional Veyra Atelier experience.",
  "/privacy",
);

const sections = [
  {
    title: "What this page is",
    content: (
      <p>
        This notice describes the intended shape of a future Veyra Atelier
        service. It is not a description of a currently operating jewelry
        business. Hosting, authentication, analytics, payment, and
        communications choices must be confirmed before a real launch.
      </p>
    ),
  },
  {
    title: "Information a working service may receive",
    content: (
      <>
        <p>A real commission service may receive information such as:</p>
        <ul>
          <li>account details, including name and email address;</li>
          <li>
            commission notes, preferences, measurements, reference files, and
            messages you choose to provide;
          </li>
          <li>
            project administration records, approvals, invoices, and payment
            status; and
          </li>
          <li>
            limited technical records needed for security and reliable
            operation.
          </li>
        </ul>
        <p>
          A final notice must identify the information actually collected. Do
          not submit unnecessary sensitive information.
        </p>
      </>
    ),
  },
  {
    title: "Why information may be used",
    content: (
      <p>
        Intended uses include responding to inquiries, preparing and managing a
        design brief, documenting approvals, supporting account access,
        administering payments where separately enabled, preventing misuse, and
        meeting obligations that genuinely apply to the operator. The deployed
        service should not claim a use it does not perform.
      </p>
    ),
  },
  {
    title: "Providers and disclosures",
    content: (
      <p>
        A production service may rely on vendors for hosting, authentication,
        email, file storage, payments, and fabrication coordination. The final
        notice should name or clearly describe those providers and explain when
        information may be shared. Commission stories or images should not be
        published without a separate, informed agreement.
      </p>
    ),
  },
  {
    title: "Retention and choices",
    content: (
      <p>
        Retention periods and request procedures have not been finalized for
        this fictional brand. A real operator should define how long inquiries,
        project records, financial records, and backups are kept, along with any
        access, correction, deletion, or objection rights available in the
        relevant location.
      </p>
    ),
  },
  {
    title: "Security and contact",
    content: (
      <p>
        No online service can promise absolute security. A deployed service
        should describe safeguards accurately and maintain an incident response
        process. Privacy questions may be directed to <PublicContactLink />. A
        configuration fallback is used when no published contact setting is
        available.
      </p>
    ),
  },
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal template / privacy"
      title="Privacy, described plainly."
      description="A transparent template for how a future commission service might explain its information practices."
      updated="September 17, 2026"
      sections={sections}
    />
  );
}
