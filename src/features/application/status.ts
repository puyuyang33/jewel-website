type Tone = "neutral" | "attention" | "positive" | "critical" | "info";

export function humanizeStatus(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function statusTone(value: string): Tone {
  if (
    [
      "accepted",
      "approved",
      "completed",
      "delivered",
      "paid",
      "published",
      "released",
      "succeeded",
    ].includes(value)
  ) {
    return "positive";
  }
  if (
    ["cancelled", "declined", "disputed", "failed", "revoked"].includes(value)
  ) {
    return "critical";
  }
  if (
    [
      "draft_review",
      "final_payment_due",
      "negotiating",
      "open",
      "pending",
      "revision_requested",
    ].includes(value)
  ) {
    return "attention";
  }
  if (["confirmed", "in_progress", "processing", "sent"].includes(value)) {
    return "info";
  }
  return "neutral";
}
