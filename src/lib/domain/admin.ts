import { z } from "zod";

import { DomainError } from "./errors";

export const normalizedEmailSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.email());

export function normalizeEmail(value: string): string {
  return normalizedEmailSchema.parse(value);
}

export function isAdminEmail(
  candidateEmail: string,
  configuredAdminEmail: string,
): boolean {
  const configured = normalizeEmail(configuredAdminEmail);
  const candidate = normalizedEmailSchema.safeParse(candidateEmail);
  return candidate.success && candidate.data === configured;
}

export class AdminEmailMismatchError extends DomainError<"ADMIN_EMAIL_MISMATCH"> {
  constructor() {
    super(
      "ADMIN_EMAIL_MISMATCH",
      "Authenticated email does not match the configured administrator",
    );
    this.name = "AdminEmailMismatchError";
  }
}

export function assertAdminEmail(
  candidateEmail: string,
  configuredAdminEmail: string,
): void {
  if (!isAdminEmail(candidateEmail, configuredAdminEmail)) {
    throw new AdminEmailMismatchError();
  }
}
