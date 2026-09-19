"use client";

import { Bell, Save } from "lucide-react";
import { useActionState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import type { ProfileDto } from "@/lib/data/types";
import { initialActionResult, type ActionResult } from "@/types/actions";

type Action = (
  previousState: ActionResult,
  formData: FormData,
) => Promise<ActionResult>;

function Checkbox({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="border-ink/10 flex gap-3 rounded-xl border bg-white/60 p-4">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="accent-garnet mt-1 size-4"
      />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="text-stone mt-1 block text-sm leading-5">
          {description}
        </span>
      </span>
    </label>
  );
}

export function ProfileForms({
  profile,
  profileAction,
  preferencesAction,
}: {
  profile: ProfileDto;
  profileAction: Action;
  preferencesAction: Action;
}) {
  const [profileState, profileFormAction] = useActionState(
    profileAction,
    initialActionResult,
  );
  const [preferenceState, preferenceFormAction] = useActionState(
    preferencesAction,
    initialActionResult,
  );

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="p-6">
        <p className="eyebrow">Identity</p>
        <h2 className="font-display mt-2 text-4xl">Your atelier profile</h2>
        <form action={profileFormAction} className="mt-6 grid gap-5">
          <ActionMessage result={profileState} />
          <div className="grid gap-2">
            <Label htmlFor="profile-email">Account email</Label>
            <Input id="profile-email" value={profile.email} readOnly disabled />
            <p className="text-stone text-xs">
              Managed by your verified sign-in provider.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              name="displayName"
              defaultValue={profile.displayName ?? ""}
              required
              maxLength={120}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone in international format</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={profile.phone ?? ""}
              placeholder="+15551234567"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="timezone">Preferred timezone</Label>
            <Input
              id="timezone"
              name="timeZone"
              defaultValue={profile.timeZone}
              required
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="marketingConsent"
              defaultChecked={profile.marketingConsent}
              className="accent-garnet size-4"
            />
            Receive occasional atelier stories and collection notes
          </label>
          <SubmitButton
            className="w-full sm:w-auto"
            pendingLabel="Saving profile…"
          >
            <Save aria-hidden="true" size={17} />
            Save profile
          </SubmitButton>
        </form>
      </Card>

      <Card className="p-6">
        <p className="eyebrow">Signals</p>
        <h2 className="font-display mt-2 text-4xl">Notification preferences</h2>
        <form action={preferenceFormAction} className="mt-6 grid gap-3">
          <ActionMessage result={preferenceState} />
          <Checkbox
            name="emailEnabled"
            label="Email delivery"
            description="Receive enabled event categories by email."
            defaultChecked={profile.notifications.emailEnabled}
          />
          <Checkbox
            name="smsEnabled"
            label="SMS delivery"
            description="Only used when a verified phone is present."
            defaultChecked={profile.notifications.smsEnabled}
          />
          <Checkbox
            name="inAppEnabled"
            label="In-app notices"
            description="Show durable updates in your private history."
            defaultChecked={profile.notifications.inAppEnabled}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              ["commissionUpdates", "Commission progress"],
              ["messageUpdates", "New messages"],
              ["quoteUpdates", "Quote activity"],
              ["paymentUpdates", "Payment status"],
              ["marketingUpdates", "Marketing notes"],
            ].map(([name, label]) => (
              <label key={name} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name={name}
                  defaultChecked={
                    profile.notifications[
                      name as keyof typeof profile.notifications
                    ] === true
                  }
                  className="accent-garnet size-4"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="quiet-start">Quiet hours start</Label>
              <Input
                id="quiet-start"
                type="time"
                name="quietHoursStart"
                defaultValue={profile.notifications.quietHoursStart ?? ""}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quiet-end">Quiet hours end</Label>
              <Input
                id="quiet-end"
                type="time"
                name="quietHoursEnd"
                defaultValue={profile.notifications.quietHoursEnd ?? ""}
              />
            </div>
          </div>
          <SubmitButton
            className="mt-3 w-full sm:w-auto"
            pendingLabel="Saving preferences…"
          >
            <Bell aria-hidden="true" size={17} />
            Save notification preferences
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
