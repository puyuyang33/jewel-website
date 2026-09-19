import { evaluateCommissionTransition } from "@/lib/domain/commissions";
import type { CommissionStatus } from "@/types/domain";

const TARGETS: CommissionStatus[] = [
  "confirmed",
  "in_progress",
  "draft_approved",
  "final_payment_due",
  "paid",
  "delivered",
  "aftercare",
  "cancelled",
  "disputed",
];

export function availableAdminTransitions(
  status: CommissionStatus,
): CommissionStatus[] {
  return TARGETS.filter(
    (target) => evaluateCommissionTransition(status, target, "admin").allowed,
  );
}
