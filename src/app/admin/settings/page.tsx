import type { Metadata } from "next";

import { SettingsManager } from "@/components/admin/settings-manager";
import { PageHeader } from "@/components/application/page-header";
import { savePublicSiteSettingsAction } from "@/features/admin/site-settings-actions";
import { getAdminSiteSettings } from "@/lib/data/admin";

export const metadata: Metadata = { title: "Site settings" };

export default async function AdminSettingsPage() {
  const settings = await getAdminSiteSettings();
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Typed configuration"
        title="Site settings"
        description="Only allowlisted setting keys and value types can be written from this surface."
      />
      <SettingsManager
        settings={settings}
        action={savePublicSiteSettingsAction}
      />
    </div>
  );
}
