import { z } from "zod";

import { SafeApplicationError } from "@/lib/security/safe-error";

export const SUPABASE_CONFIGURATION_MESSAGE =
  "Sign-in is unavailable because Supabase has not been configured.";

const supabaseUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    const isLocalHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    return (
      (url.protocol === "https:" || isLocalHttp) &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
});

export function isSafeSupabaseUrl(value: string): boolean {
  return supabaseUrlSchema.safeParse(value).success;
}

const publicConfigurationSchema = z.object({
  url: supabaseUrlSchema,
  anonKey: z.string().min(20),
});

export interface SupabasePublicConfiguration {
  url: string;
  anonKey: string;
}

export type SupabaseConfigurationResult =
  | {
      configured: true;
      value: SupabasePublicConfiguration;
      missing: readonly [];
    }
  | {
      configured: false;
      value: null;
      missing: readonly string[];
    };

export class SupabaseConfigurationError extends SafeApplicationError<"SUPABASE_NOT_CONFIGURED"> {
  constructor() {
    super({
      code: "SUPABASE_NOT_CONFIGURED",
      message: SUPABASE_CONFIGURATION_MESSAGE,
      status: 503,
    });
    this.name = "SupabaseConfigurationError";
  }
}

function isPlaceholder(value: string | undefined): boolean {
  return !value || /^replace-with-/i.test(value.trim());
}

export function getSupabaseConfiguration(): SupabaseConfigurationResult {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const missing: string[] = [];

  if (isPlaceholder(url)) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (isPlaceholder(anonKey)) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const parsed = publicConfigurationSchema.safeParse({
    url,
    anonKey,
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === "url" ? "NEXT_PUBLIC_SUPABASE_URL" : null;
      const resolvedField = field ?? "NEXT_PUBLIC_SUPABASE_ANON_KEY";
      if (!missing.includes(resolvedField)) {
        missing.push(resolvedField);
      }
    }

    return { configured: false, value: null, missing };
  }

  return {
    configured: true,
    value: parsed.data,
    missing: [],
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfiguration().configured;
}

export function requireSupabaseConfiguration(): SupabasePublicConfiguration {
  const configuration = getSupabaseConfiguration();

  if (!configuration.configured) {
    throw new SupabaseConfigurationError();
  }

  return configuration.value;
}

export function isTrustedSupabaseAuthUrl(value: string): boolean {
  const configuration = getSupabaseConfiguration();
  if (!configuration.configured) {
    return false;
  }

  try {
    const expected = new URL(configuration.value.url);
    const candidate = new URL(value);

    return (
      candidate.origin === expected.origin &&
      (candidate.pathname === "/auth/v1/authorize" ||
        candidate.pathname.startsWith("/auth/v1/authorize/")) &&
      candidate.username === "" &&
      candidate.password === ""
    );
  } catch {
    return false;
  }
}
