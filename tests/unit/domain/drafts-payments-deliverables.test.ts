import { describe, expect, it } from "vitest";

import {
  approveDraftVersion,
  authorizeRevisionRequest,
  calculateRevisionAllowance,
  evaluateRevisionRequest,
  nextUsedRevisionRounds,
  revisionRequestInputSchema,
} from "@/lib/domain/drafts";
import { decideDeliverableLock } from "@/lib/domain/deliverables";
import {
  applyPaymentEvent,
  assertPaymentEligible,
  evaluatePaymentEligibility,
  isPaymentSettled,
} from "@/lib/domain/payments";
import {
  COMMISSION_STATUSES,
  PAYMENT_EVENTS,
  PAYMENT_STATUSES,
} from "@/types/domain";

import { ids } from "./fixtures";

describe("draft approval", () => {
  const validApproval = {
    draftVersionId: ids.draft,
    status: "shared",
    currentVersion: 4,
    expectedVersion: 4,
    actor: "customer",
    approvedAt: "2026-09-17T05:00:00.000Z",
  };

  it("approves only the expected pending version by the customer", () => {
    expect(approveDraftVersion(validApproval)).toEqual({
      draftVersionId: ids.draft,
      version: 4,
      status: "approved",
      approvedAt: "2026-09-17T05:00:00.000Z",
      approvedBy: "customer",
    });
    expect(Object.isFrozen(approveDraftVersion(validApproval))).toBe(true);
  });

  it("rejects stale versions, wrong states, and unauthorized actors", () => {
    expect(() =>
      approveDraftVersion({ ...validApproval, expectedVersion: 3 }),
    ).toThrow(/current version is 4/u);
    expect(() =>
      approveDraftVersion({ ...validApproval, status: "superseded" }),
    ).toThrow(/cannot be approved/u);
    expect(() =>
      approveDraftVersion({ ...validApproval, actor: "admin" }),
    ).toThrow(/Only the customer/u);
    expect(() =>
      approveDraftVersion({ ...validApproval, actor: "system" }),
    ).toThrow(/Only the customer/u);
  });
});

describe("revision allowance", () => {
  it("calculates remaining rounds and clamps overspent history", () => {
    expect(
      calculateRevisionAllowance({
        includedRevisionRounds: 3,
        usedRevisionRounds: 1,
      }),
    ).toEqual({
      includedRevisionRounds: 3,
      usedRevisionRounds: 1,
      remainingRevisionRounds: 2,
      exhausted: false,
    });
    expect(
      calculateRevisionAllowance({
        includedRevisionRounds: 1,
        usedRevisionRounds: 4,
      }),
    ).toMatchObject({ remainingRevisionRounds: 0, exhausted: true });
  });

  it("consumes an included round for an allowed customer request", () => {
    const decision = authorizeRevisionRequest({
      request: {
        requestedBy: "customer",
        reason: "Please lower the gallery slightly.",
      },
      allowance: { includedRevisionRounds: 2, usedRevisionRounds: 1 },
    });
    expect(decision).toEqual({
      allowed: true,
      consumesIncludedRevision: true,
      complimentary: false,
      remainingAfterRequest: 0,
    });
    expect(nextUsedRevisionRounds(1, decision)).toBe(2);
  });

  it("blocks exhausted customer requests", () => {
    const input = {
      request: {
        requestedBy: "customer",
        reason: "Try another profile.",
      },
      allowance: { includedRevisionRounds: 2, usedRevisionRounds: 2 },
    };
    expect(evaluateRevisionRequest(input)).toEqual({
      allowed: false,
      reason: "REVISION_ALLOWANCE_EXHAUSTED",
      remainingAfterRequest: 0,
    });
    expect(() => authorizeRevisionRequest(input)).toThrow(/exhausted/u);
    expect(nextUsedRevisionRounds(2, evaluateRevisionRequest(input))).toBe(2);
  });

  it("requires an explicit admin authorization for a complimentary override", () => {
    const decision = authorizeRevisionRequest({
      request: {
        requestedBy: "customer",
        reason: "Try another profile.",
        complimentaryOverride: {
          authorizedBy: "admin",
          reason: "Courtesy round after a production delay.",
        },
      },
      allowance: { includedRevisionRounds: 2, usedRevisionRounds: 2 },
    });
    expect(decision).toMatchObject({
      allowed: true,
      consumesIncludedRevision: false,
      complimentary: true,
      remainingAfterRequest: 0,
    });
    expect(nextUsedRevisionRounds(2, decision)).toBe(2);
    expect(
      revisionRequestInputSchema.safeParse({
        requestedBy: "customer",
        reason: "Try another profile.",
        complimentaryOverride: true,
      }).success,
    ).toBe(false);
    expect(
      revisionRequestInputSchema.safeParse({
        requestedBy: "customer",
        reason: "Try another profile.",
        complimentaryOverride: {
          authorizedBy: "customer",
          reason: "I grant myself one.",
        },
      }).success,
    ).toBe(false);
  });

  it("treats admin-requested corrections as complimentary", () => {
    expect(
      evaluateRevisionRequest({
        request: {
          requestedBy: "admin",
          reason: "Correct the stone measurement.",
        },
        allowance: { includedRevisionRounds: 0, usedRevisionRounds: 0 },
      }),
    ).toMatchObject({
      allowed: true,
      consumesIncludedRevision: false,
      complimentary: true,
    });
    expect(
      revisionRequestInputSchema.safeParse({
        requestedBy: "admin",
        reason: "Correction",
        complimentaryOverride: {
          authorizedBy: "admin",
          reason: "Redundant override",
        },
      }).success,
    ).toBe(false);
  });
});

describe("payment eligibility and status handling", () => {
  const finalPayment = {
    commissionStatus: "final_payment_due",
    kind: "final",
    status: "not_started",
    amount: { amountMinor: 250_000, currency: "USD" },
  };

  it("allows a final payment only when the commission is ready", () => {
    expect(evaluatePaymentEligibility(finalPayment)).toEqual({
      eligible: true,
    });
    expect(
      evaluatePaymentEligibility({
        ...finalPayment,
        kind: "refund",
      }),
    ).toEqual({ eligible: false, reason: "PAYMENT_KIND_NOT_PAYABLE" });
    expect(() => assertPaymentEligible(finalPayment)).not.toThrow();
  });

  it.each([
    ["pending", "PAYMENT_IN_PROGRESS"],
    ["processing", "PAYMENT_IN_PROGRESS"],
    ["succeeded", "PAYMENT_ALREADY_SUCCEEDED"],
    ["refunded", "PAYMENT_WAS_REFUNDED"],
    ["partially_refunded", "PAYMENT_WAS_REFUNDED"],
  ])("blocks %s payment records", (status, reason) => {
    expect(evaluatePaymentEligibility({ ...finalPayment, status })).toEqual({
      eligible: false,
      reason,
    });
  });

  it("blocks payment kinds in the wrong commission state and invalid amounts", () => {
    expect(
      evaluatePaymentEligibility({
        ...finalPayment,
        commissionStatus: "in_progress",
      }),
    ).toEqual({
      eligible: false,
      reason: "COMMISSION_NOT_ELIGIBLE_FOR_PAYMENT",
    });
    expect(() =>
      assertPaymentEligible({
        ...finalPayment,
        commissionStatus: "in_progress",
      }),
    ).toThrow(/COMMISSION_NOT_ELIGIBLE/u);
    expect(() =>
      evaluatePaymentEligibility({
        ...finalPayment,
        amount: { amountMinor: 0, currency: "USD" },
      }),
    ).toThrow();
  });

  it("handles webhook events monotonically and idempotently", () => {
    expect(applyPaymentEvent("not_started", "checkout_started")).toMatchObject({
      status: "pending",
      changed: true,
    });
    expect(applyPaymentEvent("pending", "checkout_started")).toMatchObject({
      status: "pending",
      changed: false,
    });
    expect(applyPaymentEvent("pending", "payment_processing")).toMatchObject({
      status: "processing",
      changed: true,
    });
    expect(applyPaymentEvent("pending", "payment_succeeded")).toMatchObject({
      status: "succeeded",
      changed: true,
    });
    expect(applyPaymentEvent("succeeded", "payment_succeeded")).toMatchObject({
      status: "succeeded",
      changed: false,
    });
    expect(applyPaymentEvent("succeeded", "payment_failed")).toMatchObject({
      status: "succeeded",
      changed: false,
    });
    expect(
      applyPaymentEvent("succeeded", "partial_refund_succeeded"),
    ).toMatchObject({
      status: "partially_refunded",
      changed: true,
    });
    expect(
      applyPaymentEvent("partially_refunded", "refund_succeeded"),
    ).toMatchObject({ status: "refunded", changed: true });
    expect(applyPaymentEvent("refunded", "refund_succeeded")).toMatchObject({
      status: "refunded",
      changed: false,
    });
  });

  it("rejects refunds before a successful payment", () => {
    expect(() => applyPaymentEvent("pending", "refund_succeeded")).toThrow(
      /invalid/u,
    );
    expect(() =>
      applyPaymentEvent("failed", "partial_refund_succeeded"),
    ).toThrow(/invalid/u);
    expect(isPaymentSettled("succeeded")).toBe(true);
    expect(isPaymentSettled("partially_refunded")).toBe(false);
    expect(isPaymentSettled("pending")).toBe(false);
  });

  it("handles every payment status and event without silent undefined behavior", () => {
    for (const status of PAYMENT_STATUSES) {
      for (const event of PAYMENT_EVENTS) {
        const refundBeforePayment =
          (event === "partial_refund_succeeded" ||
            event === "refund_succeeded") &&
          (status === "not_started" ||
            status === "pending" ||
            status === "processing" ||
            status === "failed" ||
            status === "cancelled");

        if (refundBeforePayment) {
          expect(() => applyPaymentEvent(status, event)).toThrow(/invalid/u);
        } else {
          const transition = applyPaymentEvent(status, event);
          expect(PAYMENT_STATUSES).toContain(transition.status);
        }
      }
      expect(typeof isPaymentSettled(status)).toBe("boolean");
    }
  });
});

describe("deliverable lock", () => {
  it.each(["paid", "delivered", "aftercare", "completed"] as const)(
    "unlocks a published, fully paid customer deliverable in %s",
    (commissionStatus) => {
      expect(
        decideDeliverableLock({
          viewer: "customer",
          hasDeliverable: true,
          commissionStatus,
          paymentStatus: "succeeded",
        }),
      ).toEqual({ locked: false, reason: null });
    },
  );

  it.each([
    [false, "completed", "succeeded", "NOT_PUBLISHED"],
    [true, "cancelled", "succeeded", "COMMISSION_CANCELLED"],
    [true, "disputed", "succeeded", "COMMISSION_DISPUTED"],
    [true, "completed", "not_started", "PAYMENT_REQUIRED"],
    [true, "completed", "pending", "PAYMENT_PROCESSING"],
    [true, "completed", "processing", "PAYMENT_PROCESSING"],
    [true, "completed", "failed", "PAYMENT_REQUIRED"],
    [true, "completed", "cancelled", "PAYMENT_REQUIRED"],
    [true, "completed", "partially_refunded", "PAYMENT_REFUNDED"],
    [true, "completed", "refunded", "PAYMENT_REFUNDED"],
  ])(
    "locks based on publication=%s, commission=%s, payment=%s",
    (hasDeliverable, commissionStatus, paymentStatus, reason) => {
      expect(
        decideDeliverableLock({
          viewer: "customer",
          hasDeliverable,
          commissionStatus,
          paymentStatus,
        }),
      ).toEqual({ locked: true, reason });
    },
  );

  it.each([
    "awaiting_admin_confirmation",
    "confirmed",
    "in_progress",
    "draft_review",
    "revision_requested",
    "draft_approved",
    "final_payment_due",
  ] as const)(
    "keeps the customer locked in pre-paid commission state %s",
    (commissionStatus) => {
      expect(
        decideDeliverableLock({
          viewer: "customer",
          hasDeliverable: true,
          commissionStatus,
          paymentStatus: "succeeded",
        }),
      ).toEqual({
        locked: true,
        reason: "COMMISSION_NOT_COMPLETE",
      });
    },
  );

  it("allows an admin to inspect a published deliverable before completion", () => {
    expect(
      decideDeliverableLock({
        viewer: "admin",
        hasDeliverable: true,
        commissionStatus: "in_progress",
        paymentStatus: "not_started",
      }),
    ).toEqual({ locked: false, reason: null });
  });

  it("returns a lock decision for every commission and payment combination", () => {
    for (const commissionStatus of COMMISSION_STATUSES) {
      for (const paymentStatus of PAYMENT_STATUSES) {
        const decision = decideDeliverableLock({
          viewer: "customer",
          hasDeliverable: true,
          commissionStatus,
          paymentStatus,
        });
        expect(typeof decision.locked).toBe("boolean");
      }
    }
  });
});
