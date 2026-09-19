import "server-only";

import { cache } from "react";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { parseNormalizedEmail } from "./email";
import { AuthenticationError } from "./errors";
import { readProfileAccess } from "./profiles";
import { deriveTrustedRole, type AppRole } from "./roles";

export interface AuthenticatedUserDto {
  id: string;
  email: string;
  displayName: string | null;
  role: AppRole;
}

export interface AdminUserDto extends AuthenticatedUserDto {
  role: "admin";
}

async function loadRequiredUser(): Promise<AuthenticatedUserDto> {
  const supabase = await createServerSupabaseClient();

  const claimsResult = await supabase.auth.getClaims();
  const subject =
    !claimsResult.error && typeof claimsResult.data?.claims?.sub === "string"
      ? claimsResult.data.claims.sub
      : null;

  if (!subject) {
    throw new AuthenticationError("unauthenticated");
  }

  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user || user.id !== subject) {
    throw new AuthenticationError("unauthenticated");
  }

  const email = parseNormalizedEmail(user.email);
  if (!email) {
    throw new AuthenticationError("access_denied");
  }

  const profile = await readProfileAccess(supabase, user.id);
  if (profile.id !== user.id) {
    throw new AuthenticationError("access_denied");
  }

  const adminCheck = await supabase.rpc("is_active_admin");
  if (adminCheck.error || typeof adminCheck.data !== "boolean") {
    throw new AuthenticationError("profile_unavailable");
  }

  return Object.freeze({
    id: user.id,
    email,
    displayName: profile.displayName,
    role: deriveTrustedRole(adminCheck.data),
  });
}

export const requireUser = cache(loadRequiredUser);

export const requireAdmin = cache(async (): Promise<AdminUserDto> => {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new AuthenticationError("forbidden");
  }

  return Object.freeze({ ...user, role: "admin" as const });
});

export const getCurrentUser = cache(
  async (): Promise<AuthenticatedUserDto | null> => {
    try {
      return await requireUser();
    } catch (error) {
      if (
        error instanceof AuthenticationError &&
        (error.code === "unauthenticated" || error.code === "access_denied")
      ) {
        return null;
      }
      throw error;
    }
  },
);
