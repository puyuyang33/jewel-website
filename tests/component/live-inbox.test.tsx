import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminConversationWorkspace } from "@/components/admin/conversation-workspace";
import { AdminLiveInboxList } from "@/components/admin/live-inbox-list";
import { CustomerConversationWorkspace } from "@/components/customer/conversation-workspace";
import { ConversationLiveRefresh } from "@/features/messaging/conversation-live-refresh";
import type { ConversationDetailDto, RankedInboxPage } from "@/lib/data/types";
import type { ActionResult } from "@/types/actions";

const refresh = vi.fn();
const channel = {
  on: vi.fn(),
  subscribe: vi.fn(),
};
channel.on.mockReturnValue(channel);
channel.subscribe.mockReturnValue(channel);
const realtimeClient = {
  channel: vi.fn((name: string) => {
    void name;
    return channel;
  }),
  removeChannel: vi.fn(async () => "ok"),
  rpc: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/features/messaging/realtime-client", () => ({
  getApplicationRealtimeClient: () => realtimeClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

afterEach(cleanup);

describe("live admin inbox", () => {
  it("renders unread conversations prominently with an accessible new count", () => {
    const page: RankedInboxPage = {
      viewerId: "00000000-0000-4000-8000-000000000300",
      items: [
        {
          id: "00000000-0000-4000-8000-000000000301",
          customerId: "00000000-0000-4000-8000-000000000302",
          designRequestId: "00000000-0000-4000-8000-000000000303",
          customerName: "Mara",
          subject: "Orbit ring",
          status: "open",
          updatedAt: "2099-09-17T12:00:00.000Z",
          activityAt: "2099-09-17T12:00:00.000Z",
          latestMessageId: "00000000-0000-4000-8000-000000000304",
          latestSenderRole: "customer",
          latestMessage: "I added a reference.",
          latestMessageAt: "2099-09-17T12:00:00.000Z",
          unreadCount: 3,
        },
      ],
      hasMore: false,
      nextCursor: null,
    };
    render(
      <AdminLiveInboxList
        initialPage={page}
        adminId="00000000-0000-4000-8000-000000000300"
        query={null}
        status={null}
        unreadOnly={false}
      />,
    );

    expect(screen.getByText("New", { exact: false })).toHaveTextContent(
      "New messages: 3",
    );
    expect(screen.getByText("Mara: I added a reference.")).toBeVisible();
    expect(screen.getByRole("link", { name: /Orbit ring/i })).toHaveClass(
      "bg-garnet/[0.06]",
    );
    expect(realtimeClient.channel).toHaveBeenCalledTimes(1);
  });

  it("marks the latest message read only from the visible focused detail", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const markReadAction = vi.fn(
      async (formData: FormData): Promise<ActionResult> => {
        expect(formData.get("conversationId")).toBe(
          "00000000-0000-4000-8000-000000000305",
        );
        expect(formData.get("lastMessageId")).toBe(
          "00000000-0000-4000-8000-000000000306",
        );
        return { ok: true, message: "Read" };
      },
    );
    const conversation: ConversationDetailDto = {
      id: "00000000-0000-4000-8000-000000000305",
      customerId: "00000000-0000-4000-8000-000000000307",
      customerName: "Mara",
      designRequestId: "00000000-0000-4000-8000-000000000308",
      subject: "Orbit ring",
      status: "open",
      messages: [
        {
          id: "00000000-0000-4000-8000-000000000306",
          senderId: "00000000-0000-4000-8000-000000000307",
          senderName: "Mara",
          senderRole: "customer",
          text: "Latest message",
          sentAt: "2026-09-17T12:00:00.000Z",
          isOwn: false,
          attachments: [],
        },
      ],
      nextCursor: null,
    };
    const statusAction = vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      message: "",
    }));
    const sendAction = vi.fn(
      async (): Promise<ActionResult<{ messageId: string }>> => ({
        ok: true,
        message: "",
        data: { messageId: "00000000-0000-4000-8000-000000000309" },
      }),
    );

    render(
      <AdminConversationWorkspace
        conversation={conversation}
        clientMessageId="00000000-0000-4000-8000-000000000310"
        sendAction={sendAction}
        markReadAction={markReadAction}
        latestReadTarget={{
          id: conversation.messages[0]!.id,
          sentAt: conversation.messages[0]!.sentAt,
        }}
        statusAction={statusAction}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(markReadAction).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(markReadAction).toHaveBeenCalledTimes(1));
    const channelNames = realtimeClient.channel.mock.calls
      .map(([name]) => name)
      .filter((name) => name.startsWith("admin-conversation:"));
    expect(new Set(channelNames)).toEqual(
      new Set([`admin-conversation:${conversation.id}`]),
    );
  });

  it("subscribes an empty admin conversation before its first message", () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      message: "",
    }));
    const conversationId = "00000000-0000-4000-8000-000000000330";

    render(
      <AdminConversationWorkspace
        conversation={{
          id: conversationId,
          customerId: "00000000-0000-4000-8000-000000000331",
          customerName: "Mara",
          designRequestId: "00000000-0000-4000-8000-000000000332",
          subject: "New inquiry",
          status: "open",
          messages: [],
          nextCursor: null,
        }}
        clientMessageId="00000000-0000-4000-8000-000000000333"
        sendAction={async () => ({
          ok: true,
          message: "",
          data: { messageId: "00000000-0000-4000-8000-000000000334" },
        })}
        markReadAction={action}
        latestReadTarget={null}
        statusAction={action}
      />,
    );

    expect(realtimeClient.channel).toHaveBeenCalledWith(
      `admin-conversation:${conversationId}`,
    );
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "INSERT",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }),
      expect.any(Function),
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("does not render a composer for an archived conversation", () => {
    const action = vi.fn(async (): Promise<ActionResult> => ({
      ok: true,
      message: "",
    }));
    render(
      <AdminConversationWorkspace
        conversation={{
          id: "00000000-0000-4000-8000-000000000311",
          customerId: "00000000-0000-4000-8000-000000000312",
          customerName: "Mara",
          designRequestId: "00000000-0000-4000-8000-000000000313",
          subject: "Archived ring",
          status: "archived",
          messages: [],
          nextCursor: null,
        }}
        clientMessageId="00000000-0000-4000-8000-000000000314"
        sendAction={async () => ({
          ok: true,
          message: "",
          data: { messageId: "00000000-0000-4000-8000-000000000315" },
        })}
        markReadAction={action}
        latestReadTarget={null}
        statusAction={action}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Send message" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/disabled while this conversation is archived/i),
    ).toBeVisible();
  });

  it("uses one authorized channel for the active customer thread", () => {
    render(
      <ConversationLiveRefresh
        conversationId="00000000-0000-4000-8000-000000000316"
        latestReadTarget={null}
        markReadAction={async () => ({ ok: true, message: "" })}
      />,
    );
    const channelNames = realtimeClient.channel.mock.calls
      .map(([name]) => name)
      .filter((name) => name.startsWith("customer-conversation:"));
    expect(new Set(channelNames)).toEqual(
      new Set(["customer-conversation:00000000-0000-4000-8000-000000000316"]),
    );
  });

  it.each(["open", "archived", "closed"] as const)(
    "marks a visible %s customer thread read with status-appropriate Realtime",
    async (status) => {
      const suffix =
        status === "open" ? "0" : status === "archived" ? "1" : "2";
      const conversationId = `00000000-0000-4000-8000-00000000034${suffix}`;
      const messageId = `00000000-0000-4000-8000-00000000035${suffix}`;
      const sentAt = "2026-09-17T12:00:00.000Z";
      const markReadAction = vi.fn(
        async (formData: FormData): Promise<ActionResult> => {
          expect(formData.get("conversationId")).toBe(conversationId);
          expect(formData.get("lastMessageId")).toBe(messageId);
          return { ok: true, message: "Read" };
        },
      );

      render(
        <CustomerConversationWorkspace
          conversation={{
            id: conversationId,
            customerId: "00000000-0000-4000-8000-000000000344",
            customerName: "Mara",
            designRequestId: "00000000-0000-4000-8000-000000000345",
            subject: `${status} inquiry`,
            status,
            messages: [
              {
                id: messageId,
                senderId: "00000000-0000-4000-8000-000000000346",
                senderName: "Veyra",
                senderRole: "admin",
                text: "Final update",
                sentAt,
                isOwn: false,
                attachments: [],
              },
            ],
            nextCursor: null,
          }}
          clientMessageId="00000000-0000-4000-8000-000000000347"
          sendAction={async () => ({
            ok: true,
            message: "",
            data: { messageId: "00000000-0000-4000-8000-000000000348" },
          })}
          markReadAction={markReadAction}
          latestReadTarget={{ id: messageId, sentAt }}
        />,
      );

      await waitFor(() => expect(markReadAction).toHaveBeenCalledOnce());
      if (status === "open") {
        expect(realtimeClient.channel).toHaveBeenCalledWith(
          `customer-conversation:${conversationId}`,
        );
      } else {
        expect(realtimeClient.channel).not.toHaveBeenCalled();
        expect(
          screen.queryByRole("button", { name: "Send message" }),
        ).not.toBeInTheDocument();
      }
    },
  );
});
