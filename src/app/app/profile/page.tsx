import type { Metadata } from "next";

import { PageHeader } from "@/components/application/page-header";
import { ProfileForms } from "@/components/customer/profile-forms";
import {
  updateNotificationPreferencesAction,
  updateProfileAction,
} from "@/features/customer/actions";
import { getCustomerProfile } from "@/lib/data/customer";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const profile = await getCustomerProfile();
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Account"
        title="Profile & preferences"
        description="Keep your private contact details, timezone, consent, and notification channels precise."
      />
      <ProfileForms
        profile={profile}
        profileAction={updateProfileAction}
        preferencesAction={updateNotificationPreferencesAction}
      />
    </div>
  );
}
