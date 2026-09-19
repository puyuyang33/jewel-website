import { describe, expect, it } from "vitest";

import {
  compareMessagePositionsNewestFirst,
  createMessageCursor,
  decodeMessageCursor,
  encodeMessageCursor,
  isMessageOlderThanCursor,
  messageInputSchema,
  messageRecordSchema,
  sortMessagePositionsNewestFirst,
} from "@/lib/domain/messages";
import {
  createIdempotencyKey,
  createMessageIdempotencyKey,
  createNotificationIdempotencyKey,
  createPaymentIdempotencyKey,
  createQuoteAcceptanceIdempotencyKey,
  evaluateNotificationAttempt,
  shouldAttemptNotification,
} from "@/lib/domain/notifications";

import { ids } from "./fixtures";

describe("message validation", () => {
  it("accepts trimmed text, attachments, or both", () => {
    expect(messageInputSchema.parse({ text: "  Hello atelier  " })).toEqual({
      text: "Hello atelier",
      attachmentIds: [],
    });
    expect(
      messageInputSchema.parse({ attachmentIds: [ids.attachmentOne] }),
    ).toEqual({ text: "", attachmentIds: [ids.attachmentOne] });
    expect(
      messageRecordSchema.parse({
        id: ids.messageOne,
        commissionId: ids.commission,
        senderId: ids.sender,
        senderRole: "customer",
        text: "Reference image",
        attachmentIds: [ids.attachmentOne],
        createdAt: "2026-09-17T04:00:00.000Z",
      }),
    ).toMatchObject({ senderRole: "customer" });
    expect(
      messageRecordSchema.parse({
        id: ids.messageTwo,
        commissionId: ids.commission,
        senderId: null,
        senderRole: "system",
        text: "A new quote is ready.",
        attachmentIds: [],
        createdAt: "2026-09-17T04:00:01.000Z",
      }),
    ).toMatchObject({ senderRole: "system", senderId: null });
  });

  it("rejects empty, oversized, duplicate, excessive, and unknown input", () => {
    expect(messageInputSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(
      messageInputSchema.safeParse({ text: "x".repeat(4_001) }).success,
    ).toBe(false);
    expect(
      messageInputSchema.safeParse({
        attachmentIds: [ids.attachmentOne, ids.attachmentOne],
      }).success,
    ).toBe(false);
    expect(
      messageInputSchema.safeParse({
        attachmentIds: [
          ids.attachmentOne,
          ids.attachmentTwo,
          ids.optionOne,
          ids.optionTwo,
          ids.messageOne,
        ],
      }).success,
    ).toBe(false);
    expect(
      messageInputSchema.safeParse({ text: "Hello", isAdmin: true }).success,
    ).toBe(false);
    expect(
      messageRecordSchema.safeParse({
        id: ids.messageTwo,
        commissionId: ids.commission,
        senderId: ids.sender,
        senderRole: "system",
        text: "Invalid sender shape",
        attachmentIds: [],
        createdAt: "2026-09-17T04:00:01.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("deterministic message cursors", () => {
  const newest = {
    createdAt: "2026-09-17T05:00:01.000Z",
    id: ids.messageOne,
  };
  const sameTimeHigherId = {
    createdAt: "2026-09-17T05:00:00.000Z",
    id: ids.messageThree,
  };
  const sameTimeLowerId = {
    createdAt: "2026-09-17T05:00:00.000Z",
    id: ids.messageTwo,
  };

  it("orders by timestamp descending then ID descending", () => {
    expect(
      sortMessagePositionsNewestFirst([
        sameTimeLowerId,
        newest,
        sameTimeHigherId,
      ]),
    ).toEqual([newest, sameTimeHigherId, sameTimeLowerId]);
    expect(
      compareMessagePositionsNewestFirst(sameTimeHigherId, sameTimeLowerId),
    ).toBe(-1);
    expect(compareMessagePositionsNewestFirst(newest, newest)).toBe(0);
    expect(isMessageOlderThanCursor(sameTimeLowerId, sameTimeHigherId)).toBe(
      true,
    );
  });

  it("normalizes offsets and round-trips an opaque deterministic cursor", () => {
    const normalized = createMessageCursor({
      createdAt: "2026-09-17T00:00:00-05:00",
      id: ids.messageOne.toUpperCase(),
    });
    expect(normalized).toEqual({
      createdAt: "2026-09-17T05:00:00.000Z",
      id: ids.messageOne,
    });
    const firstEncoding = encodeMessageCursor(normalized);
    expect(encodeMessageCursor(normalized)).toBe(firstEncoding);
    expect(decodeMessageCursor(firstEncoding)).toEqual(normalized);
  });

  it.each(["garbage", "one~two~three", "%zz~value", "date~not-a-uuid"])(
    "rejects malformed cursor %s",
    (cursor) => {
      expect(() => decodeMessageCursor(cursor)).toThrow(/cursor/u);
    },
  );
});

describe("idempotency and notification helpers", () => {
  it("creates deterministic collision-resistant component keys", () => {
    const first = createIdempotencyKey("test", ["a|b", "c"]);
    expect(createIdempotencyKey(" TEST ", ["a|b", "c"])).toBe(first);
    expect(createIdempotencyKey("test", ["a", "b|c"])).not.toBe(first);
    expect(createIdempotencyKey("test", ["é"])).toBe(
      createIdempotencyKey("test", ["e\u0301"]),
    );
  });

  it("normalizes recipients while preserving event and version identity", () => {
    const base = {
      event: "quote_sent",
      entityId: ids.quote,
      eventVersion: 3,
      recipientEmail: " Customer@Example.com ",
    };
    const key = createNotificationIdempotencyKey(base);
    expect(
      createNotificationIdempotencyKey({
        ...base,
        recipientEmail: "customer@example.COM",
      }),
    ).toBe(key);
    expect(
      createNotificationIdempotencyKey({ ...base, eventVersion: 4 }),
    ).not.toBe(key);
    expect(
      createNotificationIdempotencyKey({ ...base, eventVersion: 0 }),
    ).toContain("notification");
    expect(
      createNotificationIdempotencyKey({ ...base, event: "quote_expiring" }),
    ).not.toBe(key);
  });

  it("builds stable payment keys that change across quote versions and kinds", () => {
    const key = createPaymentIdempotencyKey({
      commissionId: ids.commission,
      kind: "final",
      quoteVersion: 3,
    });
    expect(
      createPaymentIdempotencyKey({
        commissionId: ids.commission,
        kind: "final",
        quoteVersion: 3,
      }),
    ).toBe(key);
    expect(
      createPaymentIdempotencyKey({
        commissionId: ids.commission,
        kind: "final",
        quoteVersion: 4,
      }),
    ).not.toBe(key);
    expect(
      createPaymentIdempotencyKey({
        commissionId: ids.commission,
        kind: "refund",
        quoteVersion: 3,
      }),
    ).not.toBe(key);
  });

  it("keys acceptance and message retries to client-owned concurrency values", () => {
    const acceptance = {
      customerId: ids.sender,
      designRequestId: ids.request,
      quoteId: ids.quote,
      quoteVersion: 3,
      optionId: ids.optionOne,
    };
    const acceptanceKey = createQuoteAcceptanceIdempotencyKey(acceptance);
    expect(createQuoteAcceptanceIdempotencyKey(acceptance)).toBe(acceptanceKey);
    expect(
      createQuoteAcceptanceIdempotencyKey({
        ...acceptance,
        optionId: ids.optionTwo,
      }),
    ).not.toBe(acceptanceKey);

    const message = {
      conversationId: ids.commission,
      senderId: ids.sender,
      clientMessageId: ids.messageOne,
    };
    const messageKey = createMessageIdempotencyKey(message);
    expect(createMessageIdempotencyKey(message)).toBe(messageKey);
    expect(
      createMessageIdempotencyKey({
        ...message,
        clientMessageId: ids.messageTwo,
      }),
    ).not.toBe(messageKey);
  });

  it("rejects malformed or oversized idempotency values", () => {
    expect(() => createIdempotencyKey("bad namespace", ["value"])).toThrow();
    expect(() => createIdempotencyKey("event", [])).toThrow();
    expect(() => createIdempotencyKey("event", ["x".repeat(300)])).toThrow(
      /255/u,
    );
    expect(() => createIdempotencyKey("event", ["\ud800"])).toThrow(/Unicode/u);
  });

  it("makes notification retries explicit and bounded", () => {
    expect(evaluateNotificationAttempt("pending", 0, 3)).toEqual({
      shouldAttempt: true,
    });
    expect(evaluateNotificationAttempt("failed", 2, 3)).toEqual({
      shouldAttempt: true,
    });
    expect(evaluateNotificationAttempt("failed", 3, 3)).toEqual({
      shouldAttempt: false,
      reason: "MAX_ATTEMPTS_REACHED",
    });
    expect(evaluateNotificationAttempt("processing", 1, 3)).toEqual({
      shouldAttempt: false,
      reason: "ALREADY_PROCESSING",
    });
    expect(evaluateNotificationAttempt("sent", 1, 3)).toEqual({
      shouldAttempt: false,
      reason: "ALREADY_SENT",
    });
    expect(evaluateNotificationAttempt("suppressed", 0, 3)).toEqual({
      shouldAttempt: false,
      reason: "SUPPRESSED",
    });
    expect(shouldAttemptNotification("pending", 3, 3)).toBe(false);
    expect(() => evaluateNotificationAttempt("pending", 0, 0)).toThrow();
  });
});
