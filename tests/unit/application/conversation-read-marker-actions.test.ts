import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth/dal", () => ({
  requireAdmin: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("@/lib/security/logger", () => ({
  securityLogger: {
    error: vi.fn(),
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { markAdminConversationReadAction } from "@/features/admin/actions";
import { markCustomerConversationReadAction } from "@/features/customer/actions";
import { requireAdmin, requireUser } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const conversationId = "30000000-0000-4000-8000-000000000001";
const messageId = "30000000-0000-4000-8000-000000000002";

function markerFormData(): FormData {
  const formData = new FormData();
  formData.set("conversationId", conversationId);
  formData.set("lastMessageId", messageId);
  formData.set("lastReadAt", "1900-01-01T00:00:00.000Z");
  return formData;
}

describe("atomic conversation read markers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      id: "30000000-0000-4000-8000-000000000010",
      email: "admin@veyra.example",
      displayName: "Atelier Admin",
      role: "admin",
    });
    vi.mocked(requireUser).mockResolvedValue({
      id: "30000000-0000-4000-8000-000000000011",
      email: "customer@veyra.example",
      displayName: "Mara",
      role: "client",
    });
  });

  it.each([
    ["admin", markAdminConversationReadAction],
    ["customer", markCustomerConversationReadAction],
  ] as const)(
    "%s sends only the exact message identity to the atomic RPC",
    async (_actor, action) => {
      const rpc = vi.fn().mockResolvedValue({
        data: [
          {
            conversation_id: conversationId,
            user_id: "30000000-0000-4000-8000-000000000012",
            last_read_message_id: messageId,
            last_read_at: "2026-09-17T12:00:00.000Z",
            advanced: true,
          },
        ],
        error: null,
      });
      const from = vi.fn();
      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        rpc,
        from,
      } as never);

      const result = await action(markerFormData());

      expect(result).toMatchObject({ ok: true });
      expect(rpc).toHaveBeenCalledWith("advance_conversation_read_marker", {
        p_conversation_id: conversationId,
        p_message_id: messageId,
      });
      expect(from).not.toHaveBeenCalled();
    },
  );

  it("reports a stale exact message without falling back to an app upsert", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "message not found in conversation" },
    });
    const from = vi.fn();
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      rpc,
      from,
    } as never);

    const result = await markCustomerConversationReadAction(markerFormData());

    expect(result).toMatchObject({
      ok: false,
      code: "READ_MARKER_STALE",
    });
    expect(from).not.toHaveBeenCalled();
  });
});
