import type { Metadata } from "next";

import { LegalPage } from "@/components/marketing/legal-page";
import { createMarketingMetadata } from "@/components/marketing/metadata";
import { PublicContactLink } from "@/components/marketing/public-contact";

export const metadata: Metadata = createMarketingMetadata(
  "Payments and Cancellation Template",
  "A transparent, non-final payments, scheduling, and cancellation template for fictional Veyra Atelier commissions.",
  "/payment-cancellation",
);

const sections = [
  {
    title: "No purchase on the public site",
    content: (
      <p>
        The current public experience does not sell jewelry or collect payment.
        Signing in or starting a brief should not itself place an order,
        authorize a charge, or reserve production time.
      </p>
    ),
  },
  {
    title: "A future project proposal",
    content: (
      <p>
        Before paid work begins, a real client should receive a written proposal
        stating the design fee, included stages and review rounds, payment
        schedule, taxes where applicable, estimated timing, and any separately
        quoted production costs. Only the accepted proposal should govern that
        engagement.
      </p>
    ),
  },
  {
    title: "Deposits and progress payments",
    content: (
      <p>
        Deposit amounts, when they become non-refundable, and what work they
        cover have not been set for this fictional brand. A final policy should
        tie each payment to a clear milestone and explain what happens to
        approved work, sourced materials, and third-party commitments if a
        project stops.
      </p>
    ),
  },
  {
    title: "Rescheduling and pauses",
    content: (
      <p>
        A workable policy should say how consultations are rescheduled, how long
        a client may pause a project, and whether a revised quote is needed
        after an extended delay. Unexpected events should be handled in writing
        rather than through an implied promise on this page.
      </p>
    ),
  },
  {
    title: "Cancellation",
    content: (
      <p>
        Cancellation consequences depend on the stage reached, design work
        completed, non-returnable materials acquired, and commitments made to
        fabricators or suppliers. These details must be set out in the
        project-specific agreement before payment. This template does not state
        that all payments are refundable or non-refundable.
      </p>
    ),
  },
  {
    title: "Production changes and returns",
    content: (
      <p>
        Bespoke production, resizing, repairs, returns, warranties, shipping
        risk, and material variation require separate terms from the responsible
        maker or seller. Concept approval alone should not be treated as a
        promise that every production change is possible.
      </p>
    ),
  },
  {
    title: "Questions or billing concerns",
    content: (
      <p>
        A future client should raise billing questions promptly through the
        contact named in the accepted proposal. For this demonstration, the
        published contact is <PublicContactLink />. No active billing support is
        represented.
      </p>
    ),
  },
] as const;

export default function PaymentCancellationPage() {
  return (
    <LegalPage
      eyebrow="Legal template / payments"
      title="Payments and changes, without hidden edges."
      description="A non-final framework for explaining fees, scheduling, pauses, cancellation, and production boundaries."
      updated="September 17, 2026"
      sections={sections}
    />
  );
}
