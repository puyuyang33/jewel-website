import { describe, expect, it } from "vitest";

import {
  CommissionTransitionError,
  evaluateCommissionTransition,
  transitionCommission,
} from "@/lib/domain/commissions";
import {
  assertDesignRequestTransition,
  evaluateDesignRequestTransition,
  isOpenDesignRequest,
} from "@/lib/domain/design-requests";
import {
  COMMISSION_STATUSES,
  DESIGN_REQUEST_STATUSES,
  DOMAIN_ACTORS,
} from "@/types/domain";

describe("design request states", () => {
  it("supports inquiry, quote negotiation, and atomic acceptance", () => {
    expect(
      evaluateDesignRequestTransition("draft", "open", "customer"),
    ).toEqual({ allowed: true });
    expect(evaluateDesignRequestTransition("open", "quoted", "admin")).toEqual({
      allowed: true,
    });
    expect(
      evaluateDesignRequestTransition("quoted", "negotiating", "customer"),
    ).toEqual({ allowed: true });
    expect(
      evaluateDesignRequestTransition("negotiating", "quoted", "admin"),
    ).toEqual({ allowed: true });
    expect(
      evaluateDesignRequestTransition("quoted", "accepted", "system"),
    ).toEqual({ allowed: true });
  });

  it("distinguishes invalid transitions from actor permission failures", () => {
    expect(
      evaluateDesignRequestTransition("open", "quoted", "customer"),
    ).toEqual({
      allowed: false,
      reason: "DESIGN_REQUEST_ACTOR_NOT_PERMITTED",
    });
    expect(
      evaluateDesignRequestTransition("open", "accepted", "admin"),
    ).toEqual({
      allowed: false,
      reason: "INVALID_DESIGN_REQUEST_TRANSITION",
    });
    expect(() =>
      assertDesignRequestTransition("open", "quoted", "customer"),
    ).toThrow(/customer cannot transition/u);
  });

  it("marks only unresolved request states as open", () => {
    expect(isOpenDesignRequest("draft")).toBe(true);
    expect(isOpenDesignRequest("open")).toBe(true);
    expect(isOpenDesignRequest("quoted")).toBe(true);
    expect(isOpenDesignRequest("negotiating")).toBe(true);
    expect(isOpenDesignRequest("accepted")).toBe(false);
    expect(isOpenDesignRequest("declined")).toBe(false);
    expect(isOpenDesignRequest("closed")).toBe(false);
  });

  it("returns a defined policy decision for every state, target, and actor", () => {
    for (const from of DESIGN_REQUEST_STATUSES) {
      for (const to of DESIGN_REQUEST_STATUSES) {
        for (const actor of DOMAIN_ACTORS) {
          const decision = evaluateDesignRequestTransition(from, to, actor);
          expect(typeof decision.allowed).toBe("boolean");
        }
      }
    }
  });
});

describe("commission state machine", () => {
  it("supports the complete happy path with actor-specific transitions", () => {
    expect(
      transitionCommission("awaiting_admin_confirmation", "confirmed", "admin"),
    ).toEqual({
      from: "awaiting_admin_confirmation",
      to: "confirmed",
      actor: "admin",
    });
    expect(
      transitionCommission("confirmed", "in_progress", "admin"),
    ).toMatchObject({ to: "in_progress" });
    expect(
      transitionCommission("in_progress", "draft_review", "admin"),
    ).toMatchObject({ to: "draft_review" });
    expect(
      transitionCommission("draft_review", "revision_requested", "customer"),
    ).toMatchObject({ to: "revision_requested" });
    expect(
      transitionCommission("revision_requested", "draft_review", "admin"),
    ).toMatchObject({ to: "draft_review" });
    expect(
      transitionCommission("draft_review", "draft_approved", "customer"),
    ).toMatchObject({ to: "draft_approved" });
    expect(
      transitionCommission("draft_approved", "final_payment_due", "admin"),
    ).toMatchObject({ to: "final_payment_due" });
    expect(
      transitionCommission("final_payment_due", "paid", "system"),
    ).toMatchObject({ to: "paid" });
    expect(transitionCommission("paid", "delivered", "admin")).toMatchObject({
      to: "delivered",
    });
    expect(
      transitionCommission("delivered", "aftercare", "customer"),
    ).toMatchObject({ to: "aftercare" });
    expect(
      transitionCommission("aftercare", "completed", "customer"),
    ).toMatchObject({ to: "completed" });
  });

  it("allows cancellation only where the state and actor permit it", () => {
    expect(
      evaluateCommissionTransition(
        "awaiting_admin_confirmation",
        "cancelled",
        "customer",
      ),
    ).toEqual({ allowed: true });
    expect(
      evaluateCommissionTransition("in_progress", "cancelled", "customer"),
    ).toEqual({
      allowed: false,
      reason: "COMMISSION_ACTOR_NOT_PERMITTED",
    });
    expect(
      evaluateCommissionTransition("in_progress", "cancelled", "admin"),
    ).toEqual({ allowed: true });
    expect(evaluateCommissionTransition("paid", "cancelled", "admin")).toEqual({
      allowed: false,
      reason: "INVALID_COMMISSION_TRANSITION",
    });
  });

  it("handles disputes only through privileged actors", () => {
    expect(evaluateCommissionTransition("paid", "disputed", "system")).toEqual({
      allowed: true,
    });
    expect(
      evaluateCommissionTransition("delivered", "disputed", "customer"),
    ).toEqual({
      allowed: false,
      reason: "COMMISSION_ACTOR_NOT_PERMITTED",
    });
    expect(transitionCommission("disputed", "paid", "admin")).toMatchObject({
      to: "paid",
    });
  });

  it("returns explicit permission and transition errors", () => {
    expect(() =>
      transitionCommission("in_progress", "draft_review", "customer"),
    ).toThrowError(CommissionTransitionError);

    try {
      transitionCommission("in_progress", "draft_review", "customer");
      throw new Error("Expected a permission error");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(CommissionTransitionError);
      if (error instanceof CommissionTransitionError) {
        expect(error.code).toBe("COMMISSION_ACTOR_NOT_PERMITTED");
        expect(error.from).toBe("in_progress");
        expect(error.to).toBe("draft_review");
        expect(error.actor).toBe("customer");
      }
    }

    expect(() =>
      transitionCommission("awaiting_admin_confirmation", "completed", "admin"),
    ).toThrow(/cannot transition/u);
    expect(() =>
      transitionCommission("completed", "in_progress", "admin"),
    ).toThrow(/cannot transition/u);
    expect(() =>
      transitionCommission("in_progress", "in_progress", "admin"),
    ).toThrow(/cannot transition/u);
  });

  it("returns a defined policy decision for the complete transition matrix", () => {
    for (const from of COMMISSION_STATUSES) {
      for (const to of COMMISSION_STATUSES) {
        for (const actor of DOMAIN_ACTORS) {
          const decision = evaluateCommissionTransition(from, to, actor);
          expect(typeof decision.allowed).toBe("boolean");
        }
      }
    }
  });
});
