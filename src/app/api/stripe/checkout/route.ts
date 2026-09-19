import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { requireUser, type AuthenticatedUserDto } from "@/lib/auth/dal";
import { positiveMoneySchema } from "@/lib/domain/money";
import { idempotencyKeySchema } from "@/lib/domain/notifications";
import { paymentStatusSchema } from "@/lib/domain/payments";
import {
  createHostedCheckoutSession,
  retrieveHostedCheckoutSession,
  type HostedCheckoutSession,
  type RetrievedHostedCheckoutSession,
  type TrustedStripeCheckoutInput,
} from "@/lib/payments";
import { assertRequestOrigin } from "@/lib/security/origin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database.generated";

import {
  enforceLocalRateLimit,
  ProtocolError,
  readBoundedBody,
  readBoundedJson,
  safeProtocolErrorResponse,
} from "../../uploads/_lib/protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_CHECKOUT_BODY_BYTES = 8 * 1024;
const checkoutRequestSchema = z.object({
  commissionId: z.uuid(),
});
type CheckoutResponseMode = "json" | "redirect";
const checkoutSessionIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^cs_(?:test|live)_[A-Za-z0-9_]+$/u);
const checkoutReservationRowSchema = z.object({
  payment_id: z.uuid(),
  status: paymentStatusSchema,
  currency: z.string().regex(/^[A-Z]{3}$/u),
  amount_minor: z.number().int().positive().safe(),
  provider_idempotency_key: idempotencyKeySchema,
  provider_checkout_session_id: z.string().max(255).nullable(),
  checkout_expires_at: z.string().datetime({ offset: true }).nullable(),
  attempt_number: z.number().int().positive().safe(),
  resumed: z.boolean(),
  created: z.boolean(),
});
const attachedCheckoutRowSchema = z.object({
  payment_id: z.uuid(),
  status: paymentStatusSchema,
  attached: z.boolean(),
});

type CommissionRow = Database["public"]["Tables"]["commissions"]["Row"];

export interface CheckoutReservation {
  readonly id: string;
  readonly commissionId: string;
  readonly customerId: string;
  readonly provider: "stripe";
  readonly kind: "final";
  readonly status: Database["public"]["Tables"]["payments"]["Row"]["status"];
  readonly providerIdempotencyKey: string;
  readonly quoteVersion: number;
  readonly currency: string;
  readonly amountMinor: number;
  readonly checkoutSessionId: string | null;
  readonly checkoutExpiresAt: string | null;
  readonly attemptNumber: number;
  readonly resumed: boolean;
  readonly created: boolean;
}

export interface CheckoutRepository {
  assertOwnership(commissionId: string, customerId: string): Promise<void>;
  loadCommission(commissionId: string): Promise<CommissionRow | null>;
  reserveCheckout(input: {
    readonly commission: CommissionRow;
    readonly requestId: string;
  }): Promise<CheckoutReservation>;
  attachProviderSession(
    reservation: CheckoutReservation,
    checkout: HostedCheckoutSession,
  ): Promise<void>;
}

export interface CheckoutRouteDependencies {
  readonly assertOrigin: (request: Request) => void;
  readonly requireUser: () => Promise<AuthenticatedUserDto>;
  readonly enforceRateLimit: (userId: string) => void | Promise<void>;
  readonly createRepository: () => Promise<CheckoutRepository>;
  readonly createRequestId: () => string;
  readonly createCheckout: (
    input: TrustedStripeCheckoutInput,
  ) => Promise<HostedCheckoutSession>;
  readonly retrieveCheckout: (
    checkoutSessionId: string,
  ) => Promise<RetrievedHostedCheckoutSession>;
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

async function readCheckoutRequest(request: Request): Promise<{
  commissionId: string;
  responseMode: CheckoutResponseMode;
}> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (contentType === "application/json") {
    const parsed = checkoutRequestSchema.safeParse(
      await readBoundedJson(request, MAX_CHECKOUT_BODY_BYTES),
    );
    if (!parsed.success) {
      throw new ProtocolError("BAD_REQUEST");
    }
    return {
      commissionId: parsed.data.commissionId,
      responseMode: "json",
    };
  }

  if (contentType === "application/x-www-form-urlencoded") {
    let form: URLSearchParams;
    try {
      const bytes = await readBoundedBody(request, MAX_CHECKOUT_BODY_BYTES);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      form = new URLSearchParams(text);
    } catch (error) {
      if (error instanceof ProtocolError) {
        throw error;
      }
      throw new ProtocolError("BAD_REQUEST");
    }
    const commissionIds = form.getAll("commissionId");
    const parsed = checkoutRequestSchema.safeParse({
      commissionId: commissionIds[0],
    });
    if (commissionIds.length !== 1 || !parsed.success) {
      throw new ProtocolError("BAD_REQUEST");
    }
    return {
      commissionId: parsed.data.commissionId,
      responseMode: "redirect",
    };
  }

  throw new ProtocolError("UNSUPPORTED_MEDIA_TYPE");
}

function requireTrustedCheckoutUrl(value: string): string {
  if (value.length < 1 || value.length > 8_192) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.username ||
    url.password ||
    (url.port !== "" && url.port !== "443")
  ) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  return url.toString();
}

function checkoutResponse(url: string, mode: CheckoutResponseMode): Response {
  if (mode === "redirect") {
    return new Response(null, {
      status: 303,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Location: url,
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  return Response.json(
    { url },
    {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function requireResumableCheckoutUrl(
  reservation: CheckoutReservation,
  checkout: RetrievedHostedCheckoutSession,
): string {
  if (
    reservation.checkoutSessionId === null ||
    reservation.checkoutExpiresAt === null ||
    checkout.id !== reservation.checkoutSessionId ||
    checkout.status !== "open" ||
    checkout.mode !== "payment" ||
    checkout.url === null ||
    Date.parse(checkout.expiresAt) !== Date.parse(reservation.checkoutExpiresAt)
  ) {
    throw new ProtocolError("CONFLICT");
  }
  return requireTrustedCheckoutUrl(checkout.url);
}

function validateReservation(
  payment: CheckoutReservation,
  commission: CommissionRow,
): void {
  const activeStatus = ["not_started", "pending", "processing"].includes(
    payment.status,
  );
  const validSessionId =
    payment.checkoutSessionId === null ||
    checkoutSessionIdSchema.safeParse(payment.checkoutSessionId).success;
  if (
    payment.commissionId !== commission.id ||
    payment.customerId !== commission.customer_id ||
    payment.provider !== "stripe" ||
    payment.kind !== "final" ||
    !activeStatus ||
    payment.quoteVersion !== commission.accepted_quote_version ||
    payment.currency !== commission.accepted_currency ||
    payment.amountMinor !== commission.accepted_total_minor ||
    !validSessionId ||
    payment.resumed === payment.created ||
    (payment.created &&
      (payment.status !== "not_started" ||
        payment.checkoutSessionId !== null ||
        payment.checkoutExpiresAt !== null)) ||
    (payment.checkoutSessionId === null) !==
      (payment.checkoutExpiresAt === null)
  ) {
    throw new ProtocolError("CONFLICT");
  }
}

function sameCheckoutTruth(
  first: CommissionRow,
  second: CommissionRow,
): boolean {
  return (
    first.id === second.id &&
    first.customer_id === second.customer_id &&
    second.status === "final_payment_due" &&
    first.accepted_quote_version === second.accepted_quote_version &&
    first.accepted_currency === second.accepted_currency &&
    first.accepted_total_minor === second.accepted_total_minor
  );
}

export function createSupabaseCheckoutRepository(
  userClient: VeyraSupabaseClient,
  serviceClient: VeyraSupabaseClient,
): CheckoutRepository {
  return {
    async assertOwnership(commissionId, customerId) {
      const result = await userClient
        .from("commissions")
        .select("id")
        .eq("id", commissionId)
        .eq("customer_id", customerId)
        .maybeSingle();
      const row = requireData(result);
      if (!row) {
        throw new ProtocolError("NOT_FOUND");
      }
    },

    async loadCommission(commissionId) {
      return requireData(
        await serviceClient
          .from("commissions")
          .select("*")
          .eq("id", commissionId)
          .maybeSingle(),
      );
    },

    async reserveCheckout(input) {
      const { data, error } = await userClient.rpc("begin_payment_checkout", {
        p_commission_id: input.commission.id,
        p_request_id: input.requestId,
      });
      const candidate = Array.isArray(data) ? data[0] : null;
      const parsed = checkoutReservationRowSchema.safeParse(candidate);
      if (error || !parsed.success) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      return {
        id: parsed.data.payment_id,
        commissionId: input.commission.id,
        customerId: input.commission.customer_id,
        provider: "stripe",
        kind: "final",
        status: parsed.data.status,
        providerIdempotencyKey: parsed.data.provider_idempotency_key,
        quoteVersion: input.commission.accepted_quote_version,
        currency: parsed.data.currency,
        amountMinor: parsed.data.amount_minor,
        checkoutSessionId: parsed.data.provider_checkout_session_id,
        checkoutExpiresAt: parsed.data.checkout_expires_at,
        attemptNumber: parsed.data.attempt_number,
        resumed: parsed.data.resumed,
        created: parsed.data.created,
      };
    },

    async attachProviderSession(reservation, checkout) {
      const checkoutSessionId = checkoutSessionIdSchema.safeParse(checkout.id);
      const createdTime = Date.parse(checkout.createdAt);
      const expiresTime = Date.parse(checkout.expiresAt);
      if (
        !checkoutSessionId.success ||
        !Number.isFinite(createdTime) ||
        !Number.isFinite(expiresTime) ||
        expiresTime <= createdTime
      ) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }

      if (reservation.status === "pending") {
        if (
          reservation.checkoutSessionId !== checkoutSessionId.data ||
          reservation.checkoutExpiresAt === null ||
          Date.parse(reservation.checkoutExpiresAt) !== expiresTime
        ) {
          throw new ProtocolError("CONFLICT");
        }
        return;
      }

      const { data, error } = await serviceClient.rpc(
        "attach_stripe_checkout_session",
        {
          p_payment_id: reservation.id,
          p_provider_idempotency_key: reservation.providerIdempotencyKey,
          p_checkout_session_id: checkoutSessionId.data,
          p_checkout_created_at: checkout.createdAt,
          p_checkout_expires_at: checkout.expiresAt,
        },
      );
      const candidate = Array.isArray(data) ? data[0] : null;
      const parsed = attachedCheckoutRowSchema.safeParse(candidate);
      if (
        error ||
        !parsed.success ||
        parsed.data.payment_id !== reservation.id ||
        parsed.data.status === "not_started"
      ) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
    },
  };
}

const defaultDependencies: CheckoutRouteDependencies = {
  assertOrigin: assertRequestOrigin,
  requireUser,
  enforceRateLimit(userId) {
    enforceLocalRateLimit("stripe_checkout", userId, 5, 60_000);
  },
  async createRepository() {
    const userClient = await createServerSupabaseClient();
    const serviceClient = createServiceRoleClient();
    return createSupabaseCheckoutRepository(userClient, serviceClient);
  },
  createRequestId: randomUUID,
  createCheckout: createHostedCheckoutSession,
  retrieveCheckout: retrieveHostedCheckoutSession,
};

export function createCheckoutPostHandler(
  dependencies: Partial<CheckoutRouteDependencies> = {},
): (request: Request) => Promise<Response> {
  const deps = { ...defaultDependencies, ...dependencies };

  return async function checkoutPostHandler(
    request: Request,
  ): Promise<Response> {
    try {
      deps.assertOrigin(request);
      const user = await deps.requireUser();
      await deps.enforceRateLimit(user.id);
      const input = await readCheckoutRequest(request);

      const repository = await deps.createRepository();
      await repository.assertOwnership(input.commissionId, user.id);

      const commission = await repository.loadCommission(input.commissionId);
      if (!commission || commission.customer_id !== user.id) {
        throw new ProtocolError("NOT_FOUND");
      }
      if (commission.status !== "final_payment_due") {
        throw new ProtocolError("CONFLICT");
      }

      const amount = positiveMoneySchema.safeParse({
        amountMinor: commission.accepted_total_minor,
        currency: commission.accepted_currency,
      });
      if (!amount.success) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }

      const requestId = deps.createRequestId();
      if (!z.uuid().safeParse(requestId).success) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      const reservation = await repository.reserveCheckout({
        commission,
        requestId,
      });
      validateReservation(reservation, commission);

      const confirmedCommission = await repository.loadCommission(
        commission.id,
      );
      if (
        !confirmedCommission ||
        !sameCheckoutTruth(commission, confirmedCommission)
      ) {
        throw new ProtocolError("CONFLICT");
      }

      if (reservation.checkoutSessionId !== null) {
        let checkout: RetrievedHostedCheckoutSession;
        try {
          checkout = await deps.retrieveCheckout(reservation.checkoutSessionId);
        } catch {
          throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
        }
        return checkoutResponse(
          requireResumableCheckoutUrl(reservation, checkout),
          input.responseMode,
        );
      }

      let checkout: HostedCheckoutSession;
      try {
        checkout = await deps.createCheckout({
          paymentId: reservation.id,
          commissionId: commission.id,
          quoteVersion: commission.accepted_quote_version,
          kind: "final",
          providerIdempotencyKey: reservation.providerIdempotencyKey,
          customerEmail: user.email,
          amount: amount.data,
        });
      } catch {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }

      const checkoutUrl = requireTrustedCheckoutUrl(checkout.url);
      await repository.attachProviderSession(reservation, checkout);
      return checkoutResponse(checkoutUrl, input.responseMode);
    } catch (error) {
      const response = safeProtocolErrorResponse(error);
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }
  };
}

export const POST = createCheckoutPostHandler();
