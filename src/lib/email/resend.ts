import "server-only";

import { z } from "zod";

import {
  LOCAL_APPLICATION_ORIGIN,
  normalizeOrigin,
} from "@/lib/security/origin";

import {
  createDisabledEmailProvider,
  prepareCommissionEmail,
  type EmailSendResult,
  type TransactionalEmailProvider,
} from "./provider";
import type { CommissionEmailInput } from "./templates";

const resendApiKeySchema = z
  .string()
  .min(4)
  .max(512)
  .refine((value) => value === value.trim())
  .refine((value) => !value.toLowerCase().includes("replace_me"))
  .regex(/^re_[A-Za-z0-9_]+$/u);
const emailFromSchema = z
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
const providerMessageIdSchema = z.string().min(1).max(255);

export interface ResendSendPayload {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface ResendSendOptions {
  readonly idempotencyKey: string;
}

export interface ResendSendResponse {
  readonly data: { readonly id: string } | null;
  readonly error: {
    readonly name?: string | undefined;
    readonly message?: string | undefined;
    readonly statusCode?: number | null | undefined;
  } | null;
}

export interface ResendEmailClient {
  readonly emails: {
    send(
      payload: ResendSendPayload,
      options: ResendSendOptions,
    ): Promise<ResendSendResponse>;
  };
}

function isRetryableProviderError(response: ResendSendResponse): boolean {
  const statusCode = response.error?.statusCode;
  return (
    statusCode === null ||
    statusCode === undefined ||
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode >= 500
  );
}

export interface CreateResendEmailProviderOptions {
  readonly client: ResendEmailClient;
  readonly from: string;
  readonly applicationOrigin: string;
}

export function createResendEmailProvider(
  options: CreateResendEmailProviderOptions,
): TransactionalEmailProvider {
  const fromResult = emailFromSchema.safeParse(options.from);
  const applicationOrigin = normalizeOrigin(options.applicationOrigin);

  return Object.freeze({
    async send(input: CommissionEmailInput): Promise<EmailSendResult> {
      if (!fromResult.success || !applicationOrigin) {
        return Object.freeze({
          status: "failed",
          code: "invalid_configuration",
          retryable: false,
          idempotencyKey: null,
        });
      }

      let prepared;
      try {
        prepared = prepareCommissionEmail(input, applicationOrigin);
      } catch {
        return Object.freeze({
          status: "failed",
          code: "invalid_input",
          retryable: false,
          idempotencyKey: null,
        });
      }

      try {
        const response = await options.client.emails.send(
          {
            from: fromResult.data,
            to: prepared.recipientEmail,
            subject: prepared.rendered.subject,
            text: prepared.rendered.text,
            html: prepared.rendered.html,
          },
          {
            idempotencyKey: prepared.idempotencyKey,
          },
        );

        if (response.error) {
          return Object.freeze({
            status: "failed",
            code: "provider_error",
            retryable: isRetryableProviderError(response),
            idempotencyKey: prepared.idempotencyKey,
          });
        }

        const messageId = providerMessageIdSchema.safeParse(response.data?.id);
        if (!messageId.success) {
          return Object.freeze({
            status: "failed",
            code: "invalid_provider_response",
            retryable: true,
            idempotencyKey: prepared.idempotencyKey,
          });
        }

        return Object.freeze({
          status: "sent",
          providerMessageId: messageId.data,
          idempotencyKey: prepared.idempotencyKey,
        });
      } catch {
        return Object.freeze({
          status: "failed",
          code: "provider_error",
          retryable: true,
          idempotencyKey: prepared.idempotencyKey,
        });
      }
    },
  });
}

async function createLazyResendClient(
  apiKey: string,
): Promise<ResendEmailClient> {
  const { Resend } = await import("resend");
  return new Resend(apiKey);
}

function lazyResendClient(apiKey: string): ResendEmailClient {
  let clientPromise: Promise<ResendEmailClient> | undefined;

  return {
    emails: {
      async send(payload, options) {
        clientPromise ??= createLazyResendClient(apiKey);
        const client = await clientPromise;
        return client.emails.send(payload, options);
      },
    },
  };
}

export interface EmailEnvironment {
  readonly NODE_ENV?: string | undefined;
  readonly NEXT_PUBLIC_APP_URL?: string | undefined;
  readonly RESEND_API_KEY?: string | undefined;
  readonly EMAIL_FROM?: string | undefined;
}

function resolveEmailApplicationOrigin(
  environment: EmailEnvironment,
): string | null {
  return (
    normalizeOrigin(environment.NEXT_PUBLIC_APP_URL) ??
    (environment.NODE_ENV === "production" ? null : LOCAL_APPLICATION_ORIGIN)
  );
}

export function isEmailConfiguredForEnvironment(
  environment: EmailEnvironment = process.env,
): boolean {
  return Boolean(
    resolveEmailApplicationOrigin(environment) &&
    resendApiKeySchema.safeParse(environment.RESEND_API_KEY).success &&
    emailFromSchema.safeParse(environment.EMAIL_FROM).success,
  );
}

export function createEmailProviderFromEnvironment(
  environment: EmailEnvironment = process.env,
): TransactionalEmailProvider {
  const applicationOrigin = resolveEmailApplicationOrigin(environment);
  const apiKey = resendApiKeySchema.safeParse(environment.RESEND_API_KEY);
  const from = emailFromSchema.safeParse(environment.EMAIL_FROM);

  if (!applicationOrigin) {
    return createDisabledEmailProvider({
      applicationOrigin: LOCAL_APPLICATION_ORIGIN,
      reason: "not_configured",
    });
  }

  if (!apiKey.success || !from.success) {
    return createDisabledEmailProvider({
      applicationOrigin,
      reason:
        environment.NODE_ENV === "production"
          ? "not_configured"
          : "local_delivery_disabled",
    });
  }

  return createResendEmailProvider({
    client: lazyResendClient(apiKey.data),
    from: from.data,
    applicationOrigin,
  });
}
