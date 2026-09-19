import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  acceptRealtimeEvent,
  compareInboxActivity,
  createDebouncedInboxRefresh,
  createRankedInboxRpcCommand,
  decodeRankedInboxCursor,
  encodeRankedInboxCursor,
  mapRankedInboxPage,
  relativeInboxTime,
  shouldRefreshAfterSubscription,
} from "@/features/application/inbox-model";
import type { ConversationListItemDto } from "@/lib/data/types";

function conversation(id: string, activityAt: string): ConversationListItemDto {
  return {
    id,
    customerId: "00000000-0000-4000-8000-000000000201",
    subject: "Heirloom ring",
    status: "open",
    updatedAt: activityAt,
    activityAt,
    latestMessage: "A new note",
    latestMessageAt: activityAt,
    unreadCount: 0,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ranked inbox model", () => {
  it("sorts newest first and uses conversation ID as the stable tie-break", () => {
    const at = "2026-09-17T12:00:00.000Z";
    const lower = conversation("00000000-0000-4000-8000-000000000202", at);
    const higher = conversation("00000000-0000-4000-8000-000000000203", at);
    const old = conversation(
      "00000000-0000-4000-8000-000000000204",
      "2026-09-17T11:00:00.000Z",
    );

    expect([lower, old, higher].sort(compareInboxActivity)).toEqual([
      higher,
      lower,
      old,
    ]);
    const newlyActive = {
      ...old,
      activityAt: "2026-09-17T13:00:00.000Z",
      updatedAt: "2026-09-17T13:00:00.000Z",
      unreadCount: 1,
    };
    expect([higher, lower, newlyActive].sort(compareInboxActivity)[0]).toEqual(
      newlyActive,
    );
  });

  it("round-trips keyset cursors and maps bounded RPC pagination", () => {
    const cursor = {
      activityAt: "2026-09-17T12:00:00.000Z",
      conversationId: "00000000-0000-4000-8000-000000000205",
    };
    expect(decodeRankedInboxCursor(encodeRankedInboxCursor(cursor))).toEqual(
      cursor,
    );
    expect(decodeRankedInboxCursor("malformed")).toBeNull();

    const page = mapRankedInboxPage(
      [
        {
          conversation_id: cursor.conversationId,
          design_request_id: "00000000-0000-4000-8000-000000000206",
          customer_id: "00000000-0000-4000-8000-000000000207",
          customer_display_name: "Mara",
          subject: "Orbit ring",
          status: "open",
          latest_message_id: "00000000-0000-4000-8000-000000000208",
          latest_sender_kind: "customer",
          latest_preview: "New reference",
          activity_at: cursor.activityAt,
          unread_count: 2,
          has_more: true,
          next_activity_at: "2026-09-17T11:00:00.000Z",
          next_conversation_id: "00000000-0000-4000-8000-000000000209",
        },
      ],
      "00000000-0000-4000-8000-000000000200",
    );
    expect(page.items).toHaveLength(1);
    expect(page.viewerId).toBe("00000000-0000-4000-8000-000000000200");
    expect(page.hasMore).toBe(true);
    expect(decodeRankedInboxCursor(page.nextCursor ?? undefined)).toEqual({
      activityAt: "2026-09-17T11:00:00.000Z",
      conversationId: "00000000-0000-4000-8000-000000000209",
    });
  });

  it("builds exactly one bounded ranked-inbox RPC command", () => {
    const command = createRankedInboxRpcCommand({
      limit: 25,
      cursor: null,
      query: "Mara",
      status: "open",
      unreadOnly: true,
    });
    expect(command).toEqual({
      name: "admin_list_ranked_inbox",
      args: {
        p_limit: 25,
        p_before_activity_at: null,
        p_before_conversation_id: null,
        p_search: "Mara",
        p_status: "open",
        p_unread_only: true,
      },
    });

    const source = readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "src",
        "lib",
        "data",
        "admin.ts",
      ),
      "utf8",
    );
    const implementation = source.match(
      /export async function listAdminConversations[\s\S]*?\n}\n\nexport async function getAdminConversation/,
    )?.[0];
    expect(implementation).toBeDefined();
    expect(implementation?.match(/\.rpc\(/g)).toHaveLength(1);
    expect(implementation).not.toContain('.from("conversations")');
  });

  it("deduplicates realtime events, debounces refresh, and refreshes reconnects", () => {
    const seen = new Set<string>();
    expect(acceptRealtimeEvent(seen, "message-1")).toBe(true);
    expect(acceptRealtimeEvent(seen, "message-1")).toBe(false);
    expect(shouldRefreshAfterSubscription(null, "SUBSCRIBED")).toBe(false);
    expect(shouldRefreshAfterSubscription("CHANNEL_ERROR", "SUBSCRIBED")).toBe(
      true,
    );

    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = createDebouncedInboxRefresh(refresh, 100);
    scheduler.schedule();
    scheduler.schedule();
    vi.advanceTimersByTime(99);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("formats concise inbox times", () => {
    const now = Date.parse("2026-09-17T12:00:00.000Z");
    expect(relativeInboxTime("2026-09-17T11:56:00.000Z", now)).toBe("4m");
    expect(relativeInboxTime("2026-09-17T10:00:00.000Z", now)).toBe("2h");
  });
});
