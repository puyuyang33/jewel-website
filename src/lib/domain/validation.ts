import { z } from "zod";

export const entityIdSchema = z.uuid();
export const positiveVersionSchema = z
  .number()
  .int()
  .positive()
  .refine(Number.isSafeInteger, "Version must be a safe integer");
export const nonNegativeCountSchema = z
  .number()
  .int()
  .nonnegative()
  .refine(Number.isSafeInteger, "Count must be a safe integer");
export const isoInstantSchema = z.iso.datetime({ offset: true });

export type InstantInput = string | Date;

export function instantToEpochMilliseconds(value: InstantInput): number {
  const milliseconds =
    typeof value === "string"
      ? Date.parse(isoInstantSchema.parse(value))
      : value.getTime();

  if (!Number.isFinite(milliseconds)) {
    throw new RangeError("Instant must be a valid date");
  }

  return milliseconds;
}

export function normalizeInstant(value: InstantInput): string {
  return new Date(instantToEpochMilliseconds(value)).toISOString();
}
