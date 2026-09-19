import "server-only";

import { createNotificationIdempotencyKey } from "@/lib/domain/notifications";

import {
  commissionEmailInputSchema,
  renderCommissionEmail,
  type CommissionEmailInput,
  type RenderedCommissionEmail,
} from "./templates";

export type EmailFailureCode =
  | "invalid_input"
  | "invalid_configuration"
  | "provider_error"
  | "invalid_provider_response";

export type EmailDisabledReason =
  "not_configured" | "local_delivery_disabled" | "explicitly_disabled";

export type EmailSendResult =
  | {
      readonly status: "sent";
      readonly providerMessageId: string;
      readonly idempotencyKey: string;
    }
  | {
      readonly status: "disabled";
      readonly reason: EmailDisabledReason;
      readonly idempotencyKey: string;
    }
  | {
      readonly status: "failed";
      readonly code: EmailFailureCode;
      readonly retryable: boolean;
      readonly idempotencyKey: string | null;
    };

export interface TransactionalEmailProvider {
  send(input: CommissionEmailInput): Promise<EmailSendResult>;
}

export interface PreparedCommissionEmail {
  readonly recipientEmail: string;
  readonly rendered: RenderedCommissionEmail;
  readonly idempotencyKey: string;
}

export function prepareCommissionEmail(
  inputValue: CommissionEmailInput,
  applicationOrigin: string,
): PreparedCommissionEmail {
  const input = commissionEmailInputSchema.parse(inputValue);
  return Object.freeze({
    recipientEmail: input.recipientEmail,
    rendered: renderCommissionEmail(input, applicationOrigin),
    idempotencyKey: createNotificationIdempotencyKey({
      event: input.event,
      entityId: input.entityId,
      eventVersion: input.eventVersion,
      recipientEmail: input.recipientEmail,
    }),
  });
}

export interface DisabledEmailProviderOptions {
  readonly applicationOrigin: string;
  readonly reason?: EmailDisabledReason | undefined;
}

export function createDisabledEmailProvider(
  options: DisabledEmailProviderOptions,
): TransactionalEmailProvider {
  const reason = options.reason ?? "explicitly_disabled";

  return Object.freeze({
    async send(input: CommissionEmailInput): Promise<EmailSendResult> {
      try {
        const prepared = prepareCommissionEmail(
          input,
          options.applicationOrigin,
        );
        return Object.freeze({
          status: "disabled",
          reason,
          idempotencyKey: prepared.idempotencyKey,
        });
      } catch {
        return Object.freeze({
          status: "failed",
          code: "invalid_input",
          retryable: false,
          idempotencyKey: null,
        });
      }
    },
  });
}
