import { z } from "zod";

import {
  DESIGN_REQUEST_STATUSES,
  DOMAIN_ACTORS,
  type DesignRequestStatus,
  type DomainActor,
} from "@/types/domain";

import { assertNever, DomainError } from "./errors";

export const designRequestStatusSchema = z.enum(DESIGN_REQUEST_STATUSES);
export const domainActorSchema = z.enum(DOMAIN_ACTORS);

export type DesignRequestTransitionErrorCode =
  "INVALID_DESIGN_REQUEST_TRANSITION" | "DESIGN_REQUEST_ACTOR_NOT_PERMITTED";

export class DesignRequestTransitionError extends DomainError<DesignRequestTransitionErrorCode> {
  readonly from: DesignRequestStatus;
  readonly to: DesignRequestStatus;
  readonly actor: DomainActor;

  constructor(
    code: DesignRequestTransitionErrorCode,
    from: DesignRequestStatus,
    to: DesignRequestStatus,
    actor: DomainActor,
  ) {
    super(
      code,
      code === "INVALID_DESIGN_REQUEST_TRANSITION"
        ? `Design request cannot transition from ${from} to ${to}`
        : `${actor} cannot transition a design request from ${from} to ${to}`,
    );
    this.name = "DesignRequestTransitionError";
    this.from = from;
    this.to = to;
    this.actor = actor;
  }
}

function actorsForTransition(
  from: DesignRequestStatus,
  to: DesignRequestStatus,
): readonly DomainActor[] | null {
  switch (from) {
    case "draft":
      switch (to) {
        case "open":
          return ["customer"];
        case "closed":
          return ["admin"];
        case "draft":
        case "quoted":
        case "negotiating":
        case "accepted":
        case "declined":
          return null;
        default:
          return assertNever(to, "design request target status");
      }
    case "open":
      switch (to) {
        case "quoted":
          return ["admin"];
        case "declined":
          return ["customer"];
        case "closed":
          return ["admin"];
        case "draft":
        case "open":
        case "negotiating":
        case "accepted":
          return null;
        default:
          return assertNever(to, "design request target status");
      }
    case "quoted":
      switch (to) {
        case "negotiating":
          return ["customer"];
        case "accepted":
          return ["system"];
        case "declined":
          return ["customer"];
        case "closed":
          return ["admin"];
        case "draft":
        case "open":
        case "quoted":
          return null;
        default:
          return assertNever(to, "design request target status");
      }
    case "negotiating":
      switch (to) {
        case "quoted":
          return ["admin"];
        case "accepted":
          return ["system"];
        case "declined":
          return ["customer"];
        case "closed":
          return ["admin"];
        case "draft":
        case "open":
        case "negotiating":
          return null;
        default:
          return assertNever(to, "design request target status");
      }
    case "accepted":
    case "declined":
    case "closed":
      return null;
    default:
      return assertNever(from, "design request source status");
  }
}

export type DesignRequestTransitionDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: DesignRequestTransitionErrorCode;
    };

export function evaluateDesignRequestTransition(
  fromValue: DesignRequestStatus,
  toValue: DesignRequestStatus,
  actorValue: DomainActor,
): DesignRequestTransitionDecision {
  const from = designRequestStatusSchema.parse(fromValue);
  const to = designRequestStatusSchema.parse(toValue);
  const actor = domainActorSchema.parse(actorValue);
  const actors = actorsForTransition(from, to);

  if (actors === null) {
    return { allowed: false, reason: "INVALID_DESIGN_REQUEST_TRANSITION" };
  }
  return actors.includes(actor)
    ? { allowed: true }
    : { allowed: false, reason: "DESIGN_REQUEST_ACTOR_NOT_PERMITTED" };
}

export function assertDesignRequestTransition(
  fromValue: DesignRequestStatus,
  toValue: DesignRequestStatus,
  actorValue: DomainActor,
): void {
  const decision = evaluateDesignRequestTransition(
    fromValue,
    toValue,
    actorValue,
  );
  if (!decision.allowed) {
    throw new DesignRequestTransitionError(
      decision.reason,
      fromValue,
      toValue,
      actorValue,
    );
  }
}

export function isOpenDesignRequest(statusValue: DesignRequestStatus): boolean {
  const status = designRequestStatusSchema.parse(statusValue);
  switch (status) {
    case "draft":
    case "open":
    case "quoted":
    case "negotiating":
      return true;
    case "accepted":
    case "declined":
    case "closed":
      return false;
    default:
      return assertNever(status, "design request status");
  }
}
