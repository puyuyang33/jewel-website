import "server-only";

import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";

import { AuthenticationError } from "./errors";
import { parseNormalizedEmail } from "./email";

const profileSchema = z.object({
  id: z.uuid(),
  display_name: z.string().max(120).nullable(),
});

export interface ProfileAccessRecord {
  id: string;
  displayName: string | null;
}

export function hasOAuthAuthenticationMethod(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some(
    (entry) =>
      entry === "oauth" ||
      (typeof entry === "object" &&
        entry !== null &&
        "method" in entry &&
        entry.method === "oauth"),
  );
}

export function hasLinkedGoogleIdentity(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "provider" in entry &&
        entry.provider === "google",
    )
  );
}

export function isVerifiedGoogleUser(
  user: Pick<User, "app_metadata" | "email_confirmed_at" | "identities">,
): boolean {
  return (
    Boolean(user.email_confirmed_at) && hasLinkedGoogleIdentity(user.identities)
  );
}

function readDisplayName(user: User): string | null {
  const metadata = user.user_metadata;
  const value =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null;

  if (!value) {
    return null;
  }

  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function parseProfile(data: unknown): ProfileAccessRecord {
  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) {
    throw new AuthenticationError("profile_unavailable");
  }

  return {
    id: parsed.data.id,
    displayName: parsed.data.display_name,
  };
}

export async function upsertAuthenticatedProfile(
  user: User,
  supabase: VeyraSupabaseClient = createServiceRoleClient(),
): Promise<ProfileAccessRecord> {
  const email = parseNormalizedEmail(user.email);
  if (!email || !isVerifiedGoogleUser(user)) {
    throw new AuthenticationError("access_denied");
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        display_name: readDisplayName(user),
      },
      { onConflict: "id" },
    )
    .select("id,display_name")
    .single();

  if (error) {
    throw new AuthenticationError("profile_unavailable");
  }

  return parseProfile(data);
}

export async function readProfileAccess(
  supabase: VeyraSupabaseClient,
  userId: string,
): Promise<ProfileAccessRecord> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new AuthenticationError("access_denied");
  }

  return parseProfile(data);
}
