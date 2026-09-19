"use client";

import { CheckCircle2, CircleAlert, Save } from "lucide-react";
import { useActionState } from "react";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import type { AdminPublicSiteSettingsDto } from "@/lib/data/types";
import { cn, formatDate } from "@/lib/utils";
import { initialActionResult, type ActionResult } from "@/types/actions";

export function SettingsManager({
  settings,
  action,
}: {
  settings: AdminPublicSiteSettingsDto;
  action: (
    previousState: ActionResult,
    formData: FormData,
  ) => Promise<ActionResult>;
}) {
  const [state, formAction] = useActionState(action, initialActionResult);
  const isPublished =
    settings.status === "published" && settings.publishedAt !== null;

  return (
    <Card className="p-6">
      <form action={formAction} className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <p className="eyebrow">Authoritative public singleton</p>
          <h2 className="font-display mt-2 text-4xl">Public site settings</h2>
          <p className="text-stone mt-3 max-w-2xl leading-7">
            Saving publishes the typed settings consumed by the public site,
            request intake, and quote workflows. Arbitrary content keys are
            never exposed from this surface.
          </p>
        </div>
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4 lg:col-span-2",
            isPublished
              ? "border-emerald-700/20 bg-emerald-50 text-emerald-950"
              : "border-amber-700/20 bg-amber-50 text-amber-950",
          )}
          role="status"
        >
          {isPublished ? (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0" />
          ) : (
            <CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" />
          )}
          <div>
            <p className="font-semibold">
              {isPublished ? "Published and publicly active" : "Not published"}
            </p>
            <p className="mt-1 text-sm">
              {isPublished
                ? `Published ${formatDate(settings.publishedAt!)}.`
                : settings.exists
                  ? `The singleton is ${settings.status ?? "unavailable"} and the public settings RPC returns no row.`
                  : "No singleton exists yet. The public settings RPC returns no row until this form is published."}
            </p>
          </div>
        </div>
        <div className="lg:col-span-2">
          <ActionMessage result={state} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="brand-name">Brand name</Label>
          <Input
            id="brand-name"
            name="brandName"
            defaultValue={settings.brandName}
            required
            maxLength={120}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact-email">Contact email</Label>
          <Input
            id="contact-email"
            name="contactEmail"
            type="email"
            defaultValue={settings.contactEmail}
            required
            maxLength={320}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contact-phone">Contact phone</Label>
          <Input
            id="contact-phone"
            name="contactPhone"
            type="tel"
            defaultValue={settings.contactPhone}
            maxLength={40}
            placeholder="+1 555 123 4567"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="quote-validity-days">Quote validity days</Label>
          <Input
            id="quote-validity-days"
            name="quoteValidityDays"
            type="number"
            min={1}
            max={90}
            defaultValue={settings.quoteValidityDays}
            required
          />
        </div>
        <label className="border-ink/10 flex items-start gap-3 rounded-xl border bg-white p-4 lg:col-span-2">
          <input
            type="checkbox"
            name="intakeOpen"
            defaultChecked={settings.intakeOpen}
            className="accent-garnet mt-1 size-4"
          />
          <span>
            <span className="block font-semibold">New request intake open</span>
            <span className="text-stone mt-1 block text-sm leading-5">
              Customers can create and submit new design requests only while
              this published value is enabled.
            </span>
          </span>
        </label>
        <div className="lg:col-span-2">
          <SubmitButton pendingLabel="Publishing settings…">
            <Save aria-hidden="true" size={16} />
            Publish public settings
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
