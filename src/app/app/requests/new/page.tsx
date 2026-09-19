import type { Metadata } from "next";

import { PageHeader } from "@/components/application/page-header";
import { DesignRequestForm } from "@/components/customer/design-request-form";
import {
  saveDesignRequestDraftAction,
  submitDesignRequestAction,
} from "@/features/customer/actions";

export const metadata: Metadata = { title: "New design request" };

export default function NewDesignRequestPage() {
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Begin the commission"
        title="Tell us what this piece should hold."
        description="A precise private brief gives the atelier room to make something singular."
      />
      <DesignRequestForm
        saveDraftAction={saveDesignRequestDraftAction}
        submitAction={submitDesignRequestAction}
      />
    </div>
  );
}
