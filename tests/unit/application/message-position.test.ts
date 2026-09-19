import { describe, expect, it } from "vitest";

import {
  isMessagePositionNewer,
  unreadMessagesAfterFilter,
} from "@/features/application/message-position";

describe("message read positions", () => {
  it("advances by timestamp then UUID and never regresses", () => {
    const current = {
      sentAt: "2026-09-17T12:00:00.000Z",
      messageId: "00000000-0000-4000-8000-000000000501",
    };
    expect(
      isMessagePositionNewer(
        {
          sentAt: "2026-09-17T12:00:01.000Z",
          messageId: "00000000-0000-4000-8000-000000000500",
        },
        current,
      ),
    ).toBe(true);
    expect(
      isMessagePositionNewer(
        {
          sentAt: current.sentAt,
          messageId: "00000000-0000-4000-8000-000000000502",
        },
        current,
      ),
    ).toBe(true);
    expect(isMessagePositionNewer(current, current)).toBe(false);
    expect(
      isMessagePositionNewer(
        {
          sentAt: "2026-09-17T11:59:59.000Z",
          messageId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        },
        current,
      ),
    ).toBe(false);
  });

  it("counts equal-timestamp messages only when their UUID follows the marker", () => {
    expect(
      unreadMessagesAfterFilter({
        sentAt: "2026-09-17T12:00:00.000Z",
        messageId: "00000000-0000-4000-8000-000000000501",
      }),
    ).toBe(
      "sent_at.gt.2026-09-17T12:00:00.000Z,and(sent_at.eq.2026-09-17T12:00:00.000Z,id.gt.00000000-0000-4000-8000-000000000501)",
    );
  });

  it("counts all equal-timestamp messages when a legacy marker has no UUID", () => {
    expect(
      unreadMessagesAfterFilter({
        sentAt: "2026-09-17T12:00:00.000Z",
        messageId: null,
      }),
    ).toContain("id.gt.00000000-0000-0000-0000-000000000000");
  });
});
