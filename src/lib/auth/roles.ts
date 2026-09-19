import { parseNormalizedEmail } from "./email";

export const appRoles = ["client", "admin"] as const;
export type AppRole = (typeof appRoles)[number];

export function isConfiguredAdminEmail(
  email: string,
  configuredEmail: string | null = parseNormalizedEmail(
    process.env.ADMIN_GOOGLE_EMAIL,
  ),
): boolean {
  const normalizedEmail = parseNormalizedEmail(email);
  const normalizedConfiguredEmail = parseNormalizedEmail(configuredEmail);

  return (
    normalizedEmail !== null &&
    normalizedConfiguredEmail !== null &&
    normalizedEmail === normalizedConfiguredEmail
  );
}

export function deriveTrustedRole(isActiveAdmin: boolean): AppRole {
  return isActiveAdmin ? "admin" : "client";
}
