import { z } from "zod";

import { securityLogger } from "@/lib/security/logger";
import { getSafeErrorDetails } from "@/lib/security/safe-error";
import type { ActionFailure, ActionResult } from "@/types/actions";

export const uuidSchema = z.uuid();
export const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || null);
export const booleanField = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.null()])
  .transform((value) => value === "on" || value === "true");

export const decimalMinorSchema = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/, "Enter a valid amount")
  .transform((value, context) => {
    const [whole = "0", fractional = ""] = value.split(".");
    const minor = Number(whole) * 100 + Number(fractional.padEnd(2, "0"));
    if (!Number.isSafeInteger(minor)) {
      context.addIssue({
        code: "custom",
        message: "Amount is too large",
      });
      return z.NEVER;
    }
    return minor;
  });

export const optionalDecimalMinorSchema = z
  .union([decimalMinorSchema, z.literal("")])
  .transform((value) => (value === "" ? null : value));

export function parseCommaList(value: string, maximum = 20): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, maximum);
}

export function validationFailure(error: z.ZodError): ActionFailure {
  const flattened = z.flattenError(error);
  return {
    ok: false,
    code: "VALIDATION_ERROR",
    message:
      flattened.formErrors[0] ??
      error.issues[0]?.message ??
      "Check the highlighted information.",
    fieldErrors: flattened.fieldErrors,
  };
}

export function actionFailure(
  event: string,
  error: unknown,
  context: Record<string, unknown> = {},
): ActionFailure {
  const safe = getSafeErrorDetails(error);
  securityLogger.error(event, {
    ...context,
    error,
    errorCode: safe.code,
  });
  return {
    ok: false,
    code: safe.code,
    message:
      safe.code === "UNEXPECTED_ERROR"
        ? "Veyra could not save that change. Please try again."
        : safe.message,
  };
}

export function success<T>(message: string, data?: T): ActionResult<T> {
  return data === undefined
    ? { ok: true, message }
    : { ok: true, message, data };
}

export function fileEntries(formData: FormData, key: string): File[] {
  return formData
    .getAll(key)
    .filter(
      (entry): entry is File =>
        entry instanceof File && entry.size > 0 && entry.name.length > 0,
    );
}
