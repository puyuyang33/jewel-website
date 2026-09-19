import { describe, expect, it } from "vitest";

import { firstParameter, positivePage } from "@/features/application/query";
import { humanizeStatus, statusTone } from "@/features/application/status";

describe("application query parsing", () => {
  it("takes the first repeated value and rejects invalid pages", () => {
    expect(firstParameter({ status: ["open", "closed"] }, "status")).toBe(
      "open",
    );
    expect(positivePage("3")).toBe(3);
    expect(positivePage("-1")).toBe(1);
    expect(positivePage("2.4")).toBe(1);
    expect(positivePage(undefined)).toBe(1);
  });
});

describe("application status presentation", () => {
  it("humanizes workflow statuses and assigns deterministic tones", () => {
    expect(humanizeStatus("final_payment_due")).toBe("Final Payment Due");
    expect(statusTone("succeeded")).toBe("positive");
    expect(statusTone("revision_requested")).toBe("attention");
    expect(statusTone("disputed")).toBe("critical");
    expect(statusTone("in_progress")).toBe("info");
    expect(statusTone("unknown")).toBe("neutral");
  });
});
