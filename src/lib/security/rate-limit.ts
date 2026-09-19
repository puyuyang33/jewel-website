import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { AuthenticationError } from "@/lib/auth/errors";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";

import { securityLogger } from "./logger";

export const rateLimitActions = [
  "design_request_submit",
  "message_send",
  "quote_accept",
  "aftercare_open",
  "deliverable_access",
] as const;

export type RateLimitAction = (typeof rateLimitActions)[number];

const rateLimitInputSchema = z.object({
  action: z.enum(rateLimitActions),
  cost: z.number().int().min(1).max(100).default(1),
});

const externalRateLimitInputSchema = rateLimitInputSchema.extend({
  subject: z.string().min(1).max(1_024),
});

const rateLimitRowSchema = z.object({
  allowed: z.boolean(),
  remaining: z.coerce.number().int().min(0),
  reset_at: z.string().datetime({ offset: true }),
});

export interface RateLimitInput {
  action: RateLimitAction;
  cost?: number;
}

export interface ExternalRateLimitInput extends RateLimitInput {
  subject: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: string | null;
  retryAfterSeconds: number;
  source: "database" | "fail-closed";
}

export function createRateLimitKey(action: string, subject: string): string {
  return createHash("sha256")
    .update(action)
    .update("\0")
    .update(subject)
    .digest("hex");
}

function failClosed(action: string): RateLimitResult {
  securityLogger.warn("rate_limit.unavailable", { action });
  return {
    allowed: false,
    remaining: 0,
    resetAt: null,
    retryAfterSeconds: 60,
    source: "fail-closed",
  };
}

async function callRateLimitRpc(
  supabase: VeyraSupabaseClient,
  call:
    | {
        functionName: "consume_rate_limit";
        parameters: { p_action: RateLimitAction; p_cost: number };
      }
    | {
        functionName: "consume_rate_limit_for_subject";
        parameters: {
          p_action: RateLimitAction;
          p_subject_hash: string;
          p_cost: number;
        };
      },
  action: RateLimitAction,
  now: () => number,
): Promise<RateLimitResult> {
  try {
    const { data, error } =
      call.functionName === "consume_rate_limit"
        ? await supabase.rpc("consume_rate_limit", call.parameters)
        : await supabase.rpc("consume_rate_limit_for_subject", call.parameters);
    const candidate = Array.isArray(data) ? data[0] : data;
    const parsedRow = rateLimitRowSchema.safeParse(candidate);

    if (error || !parsedRow.success) {
      return failClosed(action);
    }

    return {
      allowed: parsedRow.data.allowed,
      remaining: parsedRow.data.remaining,
      resetAt: parsedRow.data.reset_at,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((Date.parse(parsedRow.data.reset_at) - now()) / 1_000),
      ),
      source: "database",
    };
  } catch {
    return failClosed(action);
  }
}

export async function consumeRateLimit(
  authenticatedClient: VeyraSupabaseClient,
  input: RateLimitInput,
  now: () => number = Date.now,
): Promise<RateLimitResult> {
  const parsedInput = rateLimitInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return failClosed("invalid");
  }

  return callRateLimitRpc(
    authenticatedClient,
    {
      functionName: "consume_rate_limit",
      parameters: {
        p_action: parsedInput.data.action,
        p_cost: parsedInput.data.cost,
      },
    },
    parsedInput.data.action,
    now,
  );
}

export async function consumeRateLimitForSubject(
  serviceClient: VeyraSupabaseClient,
  input: ExternalRateLimitInput,
  now: () => number = Date.now,
): Promise<RateLimitResult> {
  const parsedInput = externalRateLimitInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return failClosed("invalid");
  }

  return callRateLimitRpc(
    serviceClient,
    {
      functionName: "consume_rate_limit_for_subject",
      parameters: {
        p_action: parsedInput.data.action,
        p_subject_hash: createRateLimitKey(
          parsedInput.data.action,
          parsedInput.data.subject,
        ),
        p_cost: parsedInput.data.cost,
      },
    },
    parsedInput.data.action,
    now,
  );
}

export async function enforceRateLimit(
  authenticatedClient: VeyraSupabaseClient,
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const result = await consumeRateLimit(authenticatedClient, input);
  if (!result.allowed) {
    throw new AuthenticationError("rate_limited");
  }
  return result;
}

export async function enforceRateLimitForSubject(
  serviceClient: VeyraSupabaseClient,
  input: ExternalRateLimitInput,
): Promise<RateLimitResult> {
  const result = await consumeRateLimitForSubject(serviceClient, input);
  if (!result.allowed) {
    throw new AuthenticationError("rate_limited");
  }
  return result;
}
