import "server-only";

import { z } from "zod";

const serverEnvironmentSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  ADMIN_GOOGLE_EMAIL: z
    .email()
    .transform((value) => value.trim().toLowerCase()),
  STRIPE_MODE: z.enum(["test", "live"]).optional(),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  ADMIN_NOTIFICATION_EMAIL: z.email().optional(),
  BUSINESS_TIMEZONE: z.string().min(1).default("UTC"),
  DEFAULT_CURRENCY: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
  DELIVERABLE_ALLOWED_HOSTS: z
    .string()
    .default("www.dropbox.com,dropbox.com")
    .transform((value) =>
      value
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    ),
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: z.string().optional(),
  VEYRA_VERCEL_ENV: z.enum(["preview", "production"]).optional(),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function getServerEnvironment(): ServerEnvironment {
  return serverEnvironmentSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_GOOGLE_EMAIL:
      process.env.ADMIN_GOOGLE_EMAIL ?? "designer@example.com",
    STRIPE_MODE: process.env.STRIPE_MODE,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM,
    ADMIN_NOTIFICATION_EMAIL: process.env.ADMIN_NOTIFICATION_EMAIL,
    BUSINESS_TIMEZONE: process.env.BUSINESS_TIMEZONE,
    DEFAULT_CURRENCY: process.env.DEFAULT_CURRENCY,
    DELIVERABLE_ALLOWED_HOSTS: process.env.DELIVERABLE_ALLOWED_HOSTS,
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:
      process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,
    VEYRA_VERCEL_ENV: process.env.VEYRA_VERCEL_ENV,
  });
}
