import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createCustomerHistoryRpcCommand,
  decodeCustomerHistoryCursor,
  encodeCustomerHistoryCursor,
  historyTypesForFilter,
  mapCustomerHistoryPage,
} from "@/features/application/history-model";

describe("customer history model", () => {
  it("round-trips the strict three-part cursor", () => {
    const cursor = {
      occurredAt: "2026-09-17T12:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000701",
      type: "commission_status",
    };
    expect(
      decodeCustomerHistoryCursor(encodeCustomerHistoryCursor(cursor)),
    ).toEqual(cursor);
    expect(decodeCustomerHistoryCursor("invalid")).toBeNull();
  });

  it("maps accurate RPC pagination metadata and resource links", () => {
    const page = mapCustomerHistoryPage([
      {
        event_id: "00000000-0000-4000-8000-000000000702",
        event_type: "commission_status",
        title: "Commission completed",
        description: "All work is complete",
        resource_type: "commission",
        resource_id: "00000000-0000-4000-8000-000000000703",
        occurred_at: "2026-09-17T12:00:00.000Z",
        has_more: true,
        next_occurred_at: "2026-09-16T12:00:00.000Z",
        next_id: "00000000-0000-4000-8000-000000000704",
        next_type: "quote_sent",
      },
    ]);
    expect(page.items[0]).toMatchObject({
      eventType: "commission_status",
      resourceHref: "/app/commissions/00000000-0000-4000-8000-000000000703",
      tone: "positive",
    });
    expect(page.hasMore).toBe(true);
    expect(decodeCustomerHistoryCursor(page.nextCursor ?? undefined)).toEqual({
      occurredAt: "2026-09-16T12:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000704",
      type: "quote_sent",
    });
  });

  it("builds a single filtered keyset RPC command", () => {
    const command = createCustomerHistoryRpcCommand({
      limit: 25,
      cursor: null,
      query: "completed",
      types: historyTypesForFilter("commissions"),
    });
    expect(command).toEqual({
      name: "customer_list_history",
      args: {
        p_limit: 25,
        p_before_occurred_at: null,
        p_before_id: null,
        p_before_type: null,
        p_search: "completed",
        p_types: ["commission_created", "commission_status"],
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
        "customer.ts",
      ),
      "utf8",
    );
    const implementation = source.match(
      /export async function getCustomerHistory[\s\S]*?\n}\n\nexport async function getCustomerProfile/,
    )?.[0];
    expect(implementation).toBeDefined();
    expect(implementation?.match(/\.rpc\(/g)).toHaveLength(1);
    expect(implementation).not.toContain(".limit(100)");
    expect(implementation).not.toContain(".limit(200)");
  });
});
