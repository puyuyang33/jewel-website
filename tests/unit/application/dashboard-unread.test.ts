import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("customer dashboard unread source", () => {
  it("derives unread totals from message/read-marker tuples, not notifications", () => {
    const source = readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "src",
        "lib",
        "data",
        "customer.ts",
      ),
      "utf8",
    );
    const dashboard = source.match(
      /async function countCustomerUnreadMessages[\s\S]*?export async function listCustomerDesignRequests/,
    )?.[0];
    expect(dashboard).toBeDefined();
    expect(dashboard).toContain('"conversation_read_markers"');
    expect(dashboard).toContain('"messages"');
    expect(dashboard).toContain(
      '"conversation_id,last_read_at,last_read_message_id"',
    );
    expect(dashboard).toContain("unreadMessagesAfterFilter");
    expect(dashboard).not.toContain('.from("notifications")');
  });

  it("uses full read-marker tuples in customer and admin conversation lists", () => {
    const customerSource = readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "src",
        "lib",
        "data",
        "customer.ts",
      ),
      "utf8",
    );
    const adminSource = readFileSync(
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

    for (const source of [customerSource, adminSource]) {
      expect(source).toContain('"last_read_at,last_read_message_id"');
      expect(source).toContain("unreadMessagesAfterFilter");
    }
  });
});
