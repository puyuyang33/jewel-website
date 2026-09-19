import { z } from "zod";

import {
  DRAFT_VERSION_STATUSES,
  type DraftVersionStatus,
  type DomainActor,
} from "@/types/domain";

import { DomainError } from "./errors";
import {
  entityIdSchema,
  isoInstantSchema,
  nonNegativeCountSchema,
  positiveVersionSchema,
} from "./validation";

export const draftVersionStatusSchema = z.enum(DRAFT_VERSION_STATUSES);

export const draftApprovalInputSchema = z
  .object({
    draftVersionId: entityIdSchema,
    status: draftVersionStatusSchema,
    currentVersion: positiveVersionSchema,
    expectedVersion: positiveVersionSchema,
    actor: z.enum(["customer", "admin", "system"]),
    approvedAt: isoInstantSchema,
  })
  .strict();

export type DraftApprovalErrorCode =
  | "DRAFT_VERSION_CONFLICT"
  | "DRAFT_NOT_PENDING_REVIEW"
  | "DRAFT_APPROVAL_ACTOR_NOT_PERMITTED";

export class DraftApprovalError extends DomainError<DraftApprovalErrorCode> {
  constructor(code: DraftApprovalErrorCode, message: string) {
    super(code, message);
    this.name = "DraftApprovalError";
  }
}

export interface ApprovedDraftVersion {
  readonly draftVersionId: string;
  readonly version: number;
  readonly status: "approved";
  readonly approvedAt: string;
  readonly approvedBy: "customer";
}

export function approveDraftVersion(value: unknown): ApprovedDraftVersion {
  const input = draftApprovalInputSchema.parse(value);

  if (input.currentVersion !== input.expectedVersion) {
    throw new DraftApprovalError(
      "DRAFT_VERSION_CONFLICT",
      `Expected draft version ${input.expectedVersion}, but current version is ${input.currentVersion}`,
    );
  }
  if (input.actor !== "customer") {
    throw new DraftApprovalError(
      "DRAFT_APPROVAL_ACTOR_NOT_PERMITTED",
      "Only the customer can approve a draft version",
    );
  }
  if (input.status !== "shared") {
    throw new DraftApprovalError(
      "DRAFT_NOT_PENDING_REVIEW",
      `Draft version in ${input.status} cannot be approved`,
    );
  }

  return Object.freeze({
    draftVersionId: input.draftVersionId,
    version: input.currentVersion,
    status: "approved",
    approvedAt: input.approvedAt,
    approvedBy: "customer",
  });
}

export const revisionAllowanceInputSchema = z
  .object({
    includedRevisionRounds: nonNegativeCountSchema,
    usedRevisionRounds: nonNegativeCountSchema,
  })
  .strict();

export interface RevisionAllowance {
  readonly includedRevisionRounds: number;
  readonly usedRevisionRounds: number;
  readonly remainingRevisionRounds: number;
  readonly exhausted: boolean;
}

export function calculateRevisionAllowance(value: unknown): RevisionAllowance {
  const input = revisionAllowanceInputSchema.parse(value);
  const remainingRevisionRounds = Math.max(
    input.includedRevisionRounds - input.usedRevisionRounds,
    0,
  );

  return Object.freeze({
    ...input,
    remainingRevisionRounds,
    exhausted: remainingRevisionRounds === 0,
  });
}

export const complimentaryRevisionOverrideSchema = z
  .object({
    authorizedBy: z.literal("admin"),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const revisionRequestInputSchema = z
  .object({
    requestedBy: z.enum(["customer", "admin"]),
    reason: z.string().trim().min(1).max(2_000),
    complimentaryOverride: complimentaryRevisionOverrideSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (
      request.requestedBy === "admin" &&
      request.complimentaryOverride !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A complimentary override is only valid for a customer revision request",
        path: ["complimentaryOverride"],
      });
    }
  });

export type RevisionRequestDenialReason = "REVISION_ALLOWANCE_EXHAUSTED";

export type RevisionRequestDecision =
  | {
      readonly allowed: true;
      readonly consumesIncludedRevision: boolean;
      readonly complimentary: boolean;
      readonly remainingAfterRequest: number;
    }
  | {
      readonly allowed: false;
      readonly reason: RevisionRequestDenialReason;
      readonly remainingAfterRequest: number;
    };

export interface EvaluateRevisionRequestInput {
  readonly request: unknown;
  readonly allowance: unknown;
}

export function evaluateRevisionRequest(
  input: EvaluateRevisionRequestInput,
): RevisionRequestDecision {
  const request = revisionRequestInputSchema.parse(input.request);
  const allowance = calculateRevisionAllowance(input.allowance);

  if (request.requestedBy === "admin") {
    return {
      allowed: true,
      consumesIncludedRevision: false,
      complimentary: true,
      remainingAfterRequest: allowance.remainingRevisionRounds,
    };
  }

  if (request.complimentaryOverride !== undefined) {
    return {
      allowed: true,
      consumesIncludedRevision: false,
      complimentary: true,
      remainingAfterRequest: allowance.remainingRevisionRounds,
    };
  }

  if (allowance.exhausted) {
    return {
      allowed: false,
      reason: "REVISION_ALLOWANCE_EXHAUSTED",
      remainingAfterRequest: 0,
    };
  }

  return {
    allowed: true,
    consumesIncludedRevision: true,
    complimentary: false,
    remainingAfterRequest: allowance.remainingRevisionRounds - 1,
  };
}

export class RevisionAllowanceError extends DomainError<RevisionRequestDenialReason> {
  constructor() {
    super(
      "REVISION_ALLOWANCE_EXHAUSTED",
      "The included customer revision allowance has been exhausted",
    );
    this.name = "RevisionAllowanceError";
  }
}

export function authorizeRevisionRequest(
  input: EvaluateRevisionRequestInput,
): Exclude<RevisionRequestDecision, { readonly allowed: false }> {
  const decision = evaluateRevisionRequest(input);
  if (!decision.allowed) {
    throw new RevisionAllowanceError();
  }
  return Object.freeze(decision);
}

export function nextUsedRevisionRounds(
  usedRevisionRounds: number,
  decision: RevisionRequestDecision,
): number {
  const used = nonNegativeCountSchema.parse(usedRevisionRounds);
  if (!decision.allowed || !decision.consumesIncludedRevision) {
    return used;
  }
  if (used === Number.MAX_SAFE_INTEGER) {
    throw new DomainError(
      "REVISION_COUNT_OVERFLOW",
      "Revision count cannot exceed the safe integer range",
    );
  }
  return used + 1;
}

export interface DraftVersionRecord {
  readonly status: DraftVersionStatus;
  readonly version: number;
  readonly actor: DomainActor;
}
