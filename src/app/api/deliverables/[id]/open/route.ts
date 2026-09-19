import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { requireUser, type AuthenticatedUserDto } from "@/lib/auth/dal";
import { decideDeliverableLock } from "@/lib/domain/deliverables";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database.generated";

import {
  ProtocolError,
  safeProtocolErrorResponse,
} from "../../../uploads/_lib/protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const entityIdSchema = z.uuid();

type CommissionRow = Database["public"]["Tables"]["commissions"]["Row"];
type DeliverableRow = Database["public"]["Tables"]["deliverables"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

interface DeliverableBundle {
  readonly deliverable: DeliverableRow;
  readonly commission: CommissionRow;
  readonly payment: PaymentRow | null;
}

export interface DeliverableRepository {
  assertVisibleMetadata(
    deliverableId: string,
    user: AuthenticatedUserDto,
  ): Promise<void>;
  loadBundle(deliverableId: string): Promise<DeliverableBundle | null>;
  authorizeAccessAndResolveTarget(input: {
    readonly bundle: DeliverableBundle;
    readonly user: AuthenticatedUserDto;
    readonly requestId: string;
    readonly userAgent: string | null;
  }): Promise<string>;
  allowedTargetHosts(): readonly string[];
}

export interface DeliverableRouteDependencies {
  readonly requireUser: () => Promise<AuthenticatedUserDto>;
  readonly createRepository: (
    user: AuthenticatedUserDto,
  ) => Promise<DeliverableRepository>;
  readonly createRequestId: () => string;
}

function requireData<T>(result: {
  data: T;
  error: unknown;
}): NonNullable<T> | null {
  if (result.error) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  return result.data as NonNullable<T> | null;
}

function normalizeAllowedHosts(hosts: readonly string[]): Set<string> {
  const normalized = new Set<string>();
  for (const host of hosts) {
    const candidate = host.trim().toLowerCase().replace(/\.$/u, "");
    if (
      candidate.length > 0 &&
      candidate.length <= 253 &&
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(
        candidate,
      )
    ) {
      normalized.add(candidate);
    }
  }
  return normalized;
}

export function requireAllowedDeliverableTarget(
  rawTarget: string,
  allowedHosts: readonly string[],
): string {
  if (rawTarget.length < 1 || rawTarget.length > 8_192) {
    throw new ProtocolError("LOCKED");
  }

  let target: URL;
  try {
    target = new URL(rawTarget);
  } catch {
    throw new ProtocolError("LOCKED");
  }
  const host = target.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    (target.port !== "" && target.port !== "443") ||
    !normalizeAllowedHosts(allowedHosts).has(host)
  ) {
    throw new ProtocolError("LOCKED");
  }
  return target.toString();
}

export function createSupabaseDeliverableRepository(
  userClient: VeyraSupabaseClient,
  serviceClient: VeyraSupabaseClient,
): DeliverableRepository {
  const configuredHosts = (process.env.DELIVERABLE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  let supabaseHost: string | null = null;
  try {
    supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : null;
  } catch {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }

  return {
    async assertVisibleMetadata(deliverableId, user) {
      const row = requireData(
        await userClient
          .from("deliverables")
          .select("id, customer_id, status, released_at")
          .eq("id", deliverableId)
          .maybeSingle(),
      );
      if (!row) {
        throw new ProtocolError("NOT_FOUND");
      }
      if (
        (user.role !== "admin" && row.customer_id !== user.id) ||
        row.status !== "released" ||
        row.released_at === null
      ) {
        throw new ProtocolError("LOCKED");
      }
    },

    async loadBundle(deliverableId) {
      const deliverable = requireData(
        await serviceClient
          .from("deliverables")
          .select("*")
          .eq("id", deliverableId)
          .maybeSingle(),
      );
      if (!deliverable) {
        return null;
      }
      const commission = requireData(
        await serviceClient
          .from("commissions")
          .select("*")
          .eq("id", deliverable.commission_id)
          .maybeSingle(),
      );
      if (!commission) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      const payment = requireData(
        await serviceClient
          .from("payments")
          .select("*")
          .eq("commission_id", commission.id)
          .eq("kind", "final")
          .eq("status", "succeeded")
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      return { deliverable, commission, payment };
    },

    async authorizeAccessAndResolveTarget(input) {
      const { data, error } = await userClient.rpc(
        "authorize_deliverable_access",
        {
          p_deliverable_id: input.bundle.deliverable.id,
          p_request_id: input.requestId,
          p_ip_address: null,
          p_user_agent: input.userAgent,
        },
      );
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      if (!row.authorized) {
        throw new ProtocolError("LOCKED");
      }
      if (
        input.bundle.commission.status === "paid" &&
        row.resulting_commission_status !== "delivered"
      ) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      if (
        input.bundle.commission.status !== "paid" &&
        row.resulting_commission_status !== input.bundle.commission.status
      ) {
        throw new ProtocolError("CONFLICT");
      }

      const resolved = await serviceClient.rpc(
        "resolve_deliverable_secret_url",
        {
          p_access_log_id: row.access_log_id,
          p_request_id: input.requestId,
          p_actor_id: input.user.id,
        },
      );
      if (
        resolved.error ||
        typeof resolved.data !== "string" ||
        resolved.data.length < 9 ||
        resolved.data.length > 4_096
      ) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      return resolved.data;
    },

    allowedTargetHosts() {
      return supabaseHost
        ? [...configuredHosts, supabaseHost]
        : configuredHosts;
    },
  };
}

function validateBundle(
  bundle: DeliverableBundle,
  user: AuthenticatedUserDto,
): void {
  const { deliverable, commission, payment } = bundle;
  if (
    deliverable.commission_id !== commission.id ||
    deliverable.customer_id !== commission.customer_id ||
    (user.role !== "admin" && deliverable.customer_id !== user.id) ||
    deliverable.status !== "released" ||
    deliverable.released_at === null ||
    deliverable.revoked_at !== null ||
    payment === null ||
    payment.commission_id !== commission.id ||
    payment.customer_id !== commission.customer_id ||
    payment.kind !== "final" ||
    payment.status !== "succeeded" ||
    payment.currency !== commission.accepted_currency ||
    payment.amount_minor !== commission.accepted_total_minor
  ) {
    throw new ProtocolError("LOCKED");
  }

  const lock = decideDeliverableLock({
    viewer: "customer",
    hasDeliverable: true,
    commissionStatus: commission.status,
    paymentStatus: payment.status,
  });
  if (lock.locked) {
    throw new ProtocolError("LOCKED");
  }
}

const defaultDependencies: DeliverableRouteDependencies = {
  requireUser,
  async createRepository() {
    return createSupabaseDeliverableRepository(
      await createServerSupabaseClient(),
      createServiceRoleClient(),
    );
  },
  createRequestId: randomUUID,
};

export function createDeliverableOpenHandler(
  dependencies: Partial<DeliverableRouteDependencies> = {},
): (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response> {
  const deps = { ...defaultDependencies, ...dependencies };

  return async function deliverableOpenHandler(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    try {
      const user = await deps.requireUser();
      const parsedId = entityIdSchema.safeParse((await context.params).id);
      if (!parsedId.success) {
        throw new ProtocolError("NOT_FOUND");
      }

      const repository = await deps.createRepository(user);
      await repository.assertVisibleMetadata(parsedId.data, user);
      const bundle = await repository.loadBundle(parsedId.data);
      if (!bundle) {
        throw new ProtocolError("NOT_FOUND");
      }
      validateBundle(bundle, user);

      const requestId = deps.createRequestId();
      if (!entityIdSchema.safeParse(requestId).success) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      const userAgentValue = request.headers.get("user-agent");
      const userAgent =
        userAgentValue && userAgentValue.length <= 1_000
          ? userAgentValue
          : null;
      const rawTarget = await repository.authorizeAccessAndResolveTarget({
        bundle,
        user,
        requestId,
        userAgent,
      });
      const target = requireAllowedDeliverableTarget(
        rawTarget,
        repository.allowedTargetHosts(),
      );

      return new Response(null, {
        status: 303,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Location: target,
          Pragma: "no-cache",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      const response = safeProtocolErrorResponse(error);
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }
  };
}

export const GET = createDeliverableOpenHandler();
