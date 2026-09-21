import { z } from "zod";

export const stripeModeSchema = z.enum(["test", "live"]);

export const stripeSecretKeySchema = z
  .string()
  .min(12)
  .max(512)
  .refine((value) => value === value.trim())
  .refine((value) => !value.toLowerCase().includes("replace_me"))
  .regex(/^sk_(?:test|live)_[A-Za-z0-9_]+$/u);

export const stripeWebhookSecretSchema = z
  .string()
  .min(7)
  .max(512)
  .refine((value) => value === value.trim())
  .refine((value) => !value.toLowerCase().includes("replace_me"))
  .regex(/^whsec_[A-Za-z0-9_]+$/u);

export const resendApiKeySchema = z
  .string()
  .min(4)
  .max(512)
  .refine((value) => value === value.trim())
  .refine((value) => !value.toLowerCase().includes("replace_me"))
  .regex(/^re_[A-Za-z0-9_]+$/u);

export const emailFromSchema = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .refine((value) => !/[\r\n]/u.test(value), {
    message: "Sender must not contain line breaks",
  })
  .refine((value) => {
    const namedAddress = /^[^<>]{1,100}\s+<([^<>\s]+@[^<>\s]+)>$/u.exec(
      value,
    )?.[1];
    return z.email().safeParse(namedAddress ?? value).success;
  }, "Sender must contain a valid email address");
