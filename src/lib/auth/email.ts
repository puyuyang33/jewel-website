import { z } from "zod";

const normalizedEmailSchema = z.email().max(254);

export function normalizeEmail(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function parseNormalizedEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = normalizedEmailSchema.safeParse(normalizeEmail(value));
  return parsed.success ? parsed.data : null;
}

export function requireNormalizedEmail(value: unknown): string {
  const email = parseNormalizedEmail(value);
  if (!email) {
    throw new TypeError("A valid email address is required.");
  }
  return email;
}
