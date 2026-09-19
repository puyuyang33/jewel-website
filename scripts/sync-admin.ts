import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import nextEnvironment from "@next/env";
import { createClient, type User } from "@supabase/supabase-js";
import { z } from "zod";

import { parseNormalizedEmail } from "../src/lib/auth/email";
import { isSafeSupabaseUrl } from "../src/lib/supabase/config";
import type { VeyraSupabaseClient } from "../src/lib/supabase/types";
import type { Database } from "../src/types/database.generated";

const { loadEnvConfig } = nextEnvironment;
const environmentSchema = z.object({
  url: z.string().refine(isSafeSupabaseUrl),
  serviceRoleKey: z
    .string()
    .min(20)
    .refine((value) => !/^replace-with-/i.test(value)),
  adminEmail: z.email().max(254),
});

const rpcResultSchema = z
  .object({
    target_user_id: z.uuid(),
    normalized_email: z.email(),
    changed: z.boolean(),
  })
  .strict();

export interface AdminSyncEnvironment {
  url: string;
  serviceRoleKey: string;
  adminEmail: string;
}

export interface AdminSyncResult {
  userId: string;
  changed: boolean;
}

export type AdminSyncClient = Pick<VeyraSupabaseClient, "auth" | "rpc">;

export interface AdminSyncLogger {
  info(message: string): void;
  error(message: string): void;
}

export type AdminSyncErrorCode =
  | "CONFIGURATION_INVALID"
  | "AUTH_USERS_UNAVAILABLE"
  | "ADMIN_USER_NOT_FOUND"
  | "ADMIN_USER_AMBIGUOUS"
  | "GOOGLE_IDENTITY_REQUIRED"
  | "ALLOWLIST_SYNC_FAILED"
  | "ALLOWLIST_RESULT_INVALID";

const errorMessages: Record<AdminSyncErrorCode, string> = {
  CONFIGURATION_INVALID:
    "Admin synchronization configuration is incomplete or invalid.",
  AUTH_USERS_UNAVAILABLE: "Unable to read authentication users.",
  ADMIN_USER_NOT_FOUND:
    "No matching user exists. Sign in with Google once, then retry.",
  ADMIN_USER_AMBIGUOUS: "More than one matching authentication user exists.",
  GOOGLE_IDENTITY_REQUIRED:
    "The matching user must have a confirmed Google identity.",
  ALLOWLIST_SYNC_FAILED: "Unable to synchronize the administrator allowlist.",
  ALLOWLIST_RESULT_INVALID:
    "Administrator synchronization returned an invalid result.",
};

export class AdminSyncError extends Error {
  readonly code: AdminSyncErrorCode;

  constructor(code: AdminSyncErrorCode) {
    super(errorMessages[code]);
    this.name = "AdminSyncError";
    this.code = code;
  }
}

export function parseAdminSyncEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AdminSyncEnvironment {
  const parsed = environmentSchema.safeParse({
    url: environment.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    adminEmail: parseNormalizedEmail(environment.ADMIN_GOOGLE_EMAIL),
  });

  if (!parsed.success) {
    throw new AdminSyncError("CONFIGURATION_INVALID");
  }

  return parsed.data;
}

function hasConfirmedGoogleIdentity(user: User): boolean {
  return (
    Boolean(user.email_confirmed_at) &&
    user.identities?.some((identity) => identity.provider === "google") === true
  );
}

async function findSingleAdminUser(
  client: AdminSyncClient,
  normalizedEmail: string,
): Promise<User> {
  const matches: User[] = [];
  const seenPages = new Set<number>();
  let page = 1;

  while (page > 0 && !seenPages.has(page)) {
    seenPages.add(page);
    const result = await client.auth.admin.listUsers({
      page,
      perPage: 1_000,
    });

    if (result.error) {
      throw new AdminSyncError("AUTH_USERS_UNAVAILABLE");
    }

    for (const candidate of result.data.users) {
      if (parseNormalizedEmail(candidate.email) === normalizedEmail) {
        matches.push(candidate);
      }
    }

    page = result.data.nextPage ?? 0;
  }

  if (matches.length === 0) {
    throw new AdminSyncError("ADMIN_USER_NOT_FOUND");
  }
  if (matches.length > 1) {
    throw new AdminSyncError("ADMIN_USER_AMBIGUOUS");
  }

  const user = matches[0];
  if (!user || !hasConfirmedGoogleIdentity(user)) {
    throw new AdminSyncError("GOOGLE_IDENTITY_REQUIRED");
  }

  return user;
}

export async function syncAdminAllowlist(
  client: AdminSyncClient,
  email: string,
): Promise<AdminSyncResult> {
  const normalizedEmail = parseNormalizedEmail(email);
  if (!normalizedEmail) {
    throw new AdminSyncError("CONFIGURATION_INVALID");
  }

  const user = await findSingleAdminUser(client, normalizedEmail);
  const { data, error } = await client.rpc("sync_admin_allowlist", {
    p_normalized_email: normalizedEmail,
  });

  if (error) {
    throw new AdminSyncError("ALLOWLIST_SYNC_FAILED");
  }

  if (!Array.isArray(data) || data.length !== 1) {
    throw new AdminSyncError("ALLOWLIST_RESULT_INVALID");
  }

  const result = rpcResultSchema.safeParse(data[0]);
  if (
    !result.success ||
    result.data.target_user_id !== user.id ||
    result.data.normalized_email !== normalizedEmail
  ) {
    throw new AdminSyncError("ALLOWLIST_RESULT_INVALID");
  }

  return {
    userId: result.data.target_user_id,
    changed: result.data.changed,
  };
}

function createAdminSyncClient(
  url: string,
  serviceRoleKey: string,
): AdminSyncClient {
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function runAdminSync(
  options: {
    environment?: Readonly<Record<string, string | undefined>>;
    createClient?: (url: string, serviceRoleKey: string) => AdminSyncClient;
    logger?: AdminSyncLogger;
  } = {},
): Promise<0 | 1> {
  const logger = options.logger ?? console;

  try {
    const environment = parseAdminSyncEnvironment(options.environment);
    const clientFactory = options.createClient ?? createAdminSyncClient;
    const client = clientFactory(environment.url, environment.serviceRoleKey);
    const result = await syncAdminAllowlist(client, environment.adminEmail);

    logger.info(
      JSON.stringify({
        level: "info",
        event: result.changed
          ? "admin.sync_completed"
          : "admin.sync_already_current",
        userId: result.userId,
        changed: result.changed,
      }),
    );
    return 0;
  } catch (error) {
    const safeError =
      error instanceof AdminSyncError
        ? error
        : new AdminSyncError("ALLOWLIST_SYNC_FAILED");

    logger.error(
      JSON.stringify({
        level: "error",
        event: "admin.sync_failed",
        code: safeError.code,
        message: safeError.message,
      }),
    );
    return 1;
  }
}

function isDirectExecution(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(
    entryPoint && import.meta.url === pathToFileURL(resolve(entryPoint)).href,
  );
}

async function main(): Promise<void> {
  try {
    loadEnvConfig(process.cwd());
    process.exitCode = await runAdminSync();
  } catch {
    console.error(
      JSON.stringify({
        level: "error",
        event: "admin.sync_failed",
        code: "ALLOWLIST_SYNC_FAILED",
        message: errorMessages.ALLOWLIST_SYNC_FAILED,
      }),
    );
    process.exitCode = 1;
  }
}

if (isDirectExecution()) {
  void main();
}
