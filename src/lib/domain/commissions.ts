import { z } from "zod";

import {
  COMMISSION_STATUSES,
  DOMAIN_ACTORS,
  type CommissionStatus,
  type DomainActor,
} from "@/types/domain";

import { assertNever, DomainError } from "./errors";

export const commissionStatusSchema = z.enum(COMMISSION_STATUSES);
export const commissionActorSchema = z.enum(DOMAIN_ACTORS);

export type CommissionTransitionErrorCode =
  "INVALID_COMMISSION_TRANSITION" | "COMMISSION_ACTOR_NOT_PERMITTED";

export class CommissionTransitionError extends DomainError<CommissionTransitionErrorCode> {
  readonly from: CommissionStatus;
  readonly to: CommissionStatus;
  readonly actor: DomainActor;

  constructor(
    code: CommissionTransitionErrorCode,
    from: CommissionStatus,
    to: CommissionStatus,
    actor: DomainActor,
  ) {
    super(
      code,
      code === "INVALID_COMMISSION_TRANSITION"
        ? `Commission cannot transition from ${from} to ${to}`
        : `${actor} cannot transition a commission from ${from} to ${to}`,
    );
    this.name = "CommissionTransitionError";
    this.from = from;
    this.to = to;
    this.actor = actor;
  }
}

function actorsForTransition(
  from: CommissionStatus,
  to: CommissionStatus,
): readonly DomainActor[] | null {
  switch (from) {
    case "awaiting_admin_confirmation":
      switch (to) {
        case "confirmed":
          return ["admin"];
        case "cancelled":
          return ["customer", "admin"];
        case "awaiting_admin_confirmation":
        case "in_progress":
        case "draft_review":
        case "revision_requested":
        case "draft_approved":
        case "final_payment_due":
        case "paid":
        case "delivered":
        case "aftercare":
        case "completed":
        case "disputed":
          return null;
        default:
          return assertNever(to, "commission target status");
      }
    case "confirmed":
      switch (to) {
        case "in_progress":
          return ["admin"];
        case "cancelled":
          return ["customer", "admin"];
        case "awaiting_admin_confirmation":
        case "confirmed":
        case "draft_review":
        case "revision_requested":
        case "draft_approved":
        case "final_payment_due":
        case "paid":
        case "delivered":
        case "aftercare":
        case "completed":
        case "disputed":
          return null;
        default:
          return assertNever(to, "commission target status");
      }
    case "in_progress":
      switch (to) {
        case "draft_review":
        case "cancelled":
          return ["admin"];
        case "awaiting_admin_confirmation":
        case "confirmed":
        case "in_progress":
        case "revision_requested":
        case "draft_approved":
        case "final_payment_due":
        case "paid":
        case "delivered":
        case "aftercare":
        case "completed":
        case "disputed":
          return null;
        default:
          return assertNever(to, "commission target status");
      }
    case "draft_review":
      switch (to) {
        case "revision_requested":
        case "draft_approved":
          return ["customer"];
        case "cancelled":
          return ["admin"];
        case "awaiting_admin_confirmation":
        case "confirmed":
        case "in_progress":
        case "draft_review":
        case "final_payment_due":
        case "paid":
        case "delivered":
        case "aftercare":
        case "completed":
        case "disputed":
          return null;
        default:
          return assertNever(to, "commission target status");
      }
    case "revision_requested":
      switch (to) {
        case "draft_review":
        case "cancelled":
          return ["admin"];
        case "awaiting_admin_confirmation":
        case "confirmed":
        case "in_progress":
        case "revision_requested":
        case "draft_approved":
        case "final_payment_due":
        case "paid":
        case "delivered":
        case "aftercare":
        case "completed":
        case "disputed":
          return null;
        default:
          return assertNever(to, "commission target status");
      }
    case "draft_approved":
      switch (to) {
        case "final_payment_due":
        case "cancelled":
          return ["admin"];
        case "awaiting_admin_confirmation":
        case "confirmed":
        case "in_progress":
        case "draft_review":
        case "revision_requested":
        case "draft_approved":
        case "paid":
        case "delivered":
        case "aftercare":
        case "completed":
        case "disputed":
          return null;
        default:
          return assertNever(to, "commission target status");
      }
    case "final_payment_due":
      switch (to) {
        case "paid":
          return ["system"];
        case "cancelled":
          return ["customer", "admin"];
        case "awaiting_admin_confirmation":
        case "confirmed":
        case "in_progress":
        case "draft_review":
        case "revision_requested":
        case "draft_approved":
        case "final_payment_due":
        case "delivered":
        case "aftercare":
        case "completed":
        case "disputed":
          return null;
        default:
          return assertNever(to, "commission target status");
      }
    case "paid":
      switch (to) {
        case "delivered":
          return ["admin"];
        case "disputed":
          return ["admin", "system"];
        case "awaiting_admin_confirmation":
        case "confirmed":
        case "in_progress":
        case "draft_review":
        case "revision_requested":
        case "draft_approved":
        case "final_payment_due":
        case "paid":
        case "aftercare":
        case "completed":
        case "cancelled":
          return null;
        default:
          return assertNever(to, "commission target status");
      }
    case "delivered":
      switch (to) {
        case "aftercare":
          return ["customer", "admin"];
        case "disputed":
          return ["admin", "system"];
        case "awaiting_admin_confirmation":
        case "confirmed":
        case "in_progress":
        case "draft_review":
        case "revision_requested":
        case "draft_approved":
        case "final_payment_due":
        case "paid":
        case "delivered":
        case "completed":
        case "cancelled":
          return null;
        default:
          return assertNever(to, "commission target status");
      }
    case "aftercare":
      switch (to) {
        case "completed":
          return ["customer"];
        case "disputed":
          return ["admin", "system"];
        case "awaiting_admin_confirmation":
        case "confirmed":
        case "in_progress":
        case "draft_review":
        case "revision_requested":
        case "draft_approved":
        case "final_payment_due":
        case "paid":
        case "delivered":
        case "aftercare":
        case "cancelled":
          return null;
        default:
          return assertNever(to, "commission target status");
      }
    case "disputed":
      switch (to) {
        case "paid":
          return ["admin", "system"];
        case "cancelled":
          return ["admin"];
        case "awaiting_admin_confirmation":
        case "confirmed":
        case "in_progress":
        case "draft_review":
        case "revision_requested":
        case "draft_approved":
        case "final_payment_due":
        case "delivered":
        case "aftercare":
        case "completed":
        case "disputed":
          return null;
        default:
          return assertNever(to, "commission target status");
      }
    case "completed":
    case "cancelled":
      return null;
    default:
      return assertNever(from, "commission source status");
  }
}

export type CommissionTransitionDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: CommissionTransitionErrorCode;
    };

export function evaluateCommissionTransition(
  fromValue: CommissionStatus,
  toValue: CommissionStatus,
  actorValue: DomainActor,
): CommissionTransitionDecision {
  const from = commissionStatusSchema.parse(fromValue);
  const to = commissionStatusSchema.parse(toValue);
  const actor = commissionActorSchema.parse(actorValue);
  const actors = actorsForTransition(from, to);

  if (actors === null) {
    return { allowed: false, reason: "INVALID_COMMISSION_TRANSITION" };
  }
  return actors.includes(actor)
    ? { allowed: true }
    : { allowed: false, reason: "COMMISSION_ACTOR_NOT_PERMITTED" };
}

export interface CommissionTransition {
  readonly from: CommissionStatus;
  readonly to: CommissionStatus;
  readonly actor: DomainActor;
}

export function transitionCommission(
  fromValue: CommissionStatus,
  toValue: CommissionStatus,
  actorValue: DomainActor,
): CommissionTransition {
  const from = commissionStatusSchema.parse(fromValue);
  const to = commissionStatusSchema.parse(toValue);
  const actor = commissionActorSchema.parse(actorValue);
  const decision = evaluateCommissionTransition(from, to, actor);

  if (!decision.allowed) {
    throw new CommissionTransitionError(decision.reason, from, to, actor);
  }

  return Object.freeze({ from, to, actor });
}
