import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createMessageRpcCommand } from "@/features/application/rpc-commands";
import { createPublishDraftRpcCommand } from "@/features/admin/rpc-commands";
import { availableAdminTransitions } from "@/features/admin/transitions";
import {
  createCounterofferRpcCommand,
  createDraftApprovalRpcCommand,
  createDraftRevisionRequestRpcCommand,
  createOpenAftercareRpcCommand,
} from "@/features/customer/rpc-commands";

const ids = {
  quote: "00000000-0000-4000-8000-000000000101",
  option: "00000000-0000-4000-8000-000000000102",
  idempotency: "00000000-0000-4000-8000-000000000103",
  conversation: "00000000-0000-4000-8000-000000000104",
  message: "00000000-0000-4000-8000-000000000105",
  attachment: "00000000-0000-4000-8000-000000000106",
  commission: "00000000-0000-4000-8000-000000000107",
  revision: "00000000-0000-4000-8000-000000000108",
};

describe("hardened RPC command selection", () => {
  it("submits only customer proposal fields to submit_counteroffer", () => {
    const command = createCounterofferRpcCommand({
      quoteId: ids.quote,
      optionId: ids.option,
      proposedTotalMinor: 725_000,
      explanation: "Prioritize the center stone.",
      idempotencyKey: ids.idempotency,
    });

    expect(command).toEqual({
      name: "submit_counteroffer",
      args: {
        p_quote_version_id: ids.quote,
        p_quote_option_id: ids.option,
        p_proposed_total_minor: 725_000,
        p_explanation: "Prioritize the center stone.",
        p_idempotency_key: ids.idempotency,
      },
    });
    expect(command.args).not.toHaveProperty("p_proposed_scope");
    expect(command.args).not.toHaveProperty("p_proposed_deposit_minor");
  });

  it("sends only verified attachment IDs through send_message", () => {
    expect(
      createMessageRpcCommand({
        conversationId: ids.conversation,
        clientMessageId: ids.message,
        body: "",
        attachmentIds: [ids.attachment],
      }),
    ).toEqual({
      name: "send_message",
      args: {
        p_conversation_id: ids.conversation,
        p_client_message_id: ids.message,
        p_body: "",
        p_attachment_ids: [ids.attachment],
      },
    });
  });

  it("uses only latest-draft atomic RPCs for customer decisions", () => {
    expect(
      createDraftApprovalRpcCommand({
        commissionId: ids.commission,
        revisionId: ids.revision,
        expectedVersion: 3,
        clientFeedbackId: ids.idempotency,
      }).name,
    ).toBe("approve_latest_draft_revision");
    expect(
      createDraftRevisionRequestRpcCommand({
        commissionId: ids.commission,
        revisionId: ids.revision,
        expectedVersion: 3,
        reason: "Refine the shoulder.",
        clientFeedbackId: ids.idempotency,
      }).name,
    ).toBe("request_latest_draft_revision");
  });

  it("publishes a draft through the single atomic admin RPC", () => {
    expect(
      createPublishDraftRpcCommand({
        commissionId: ids.commission,
        designDraftId: "00000000-0000-4000-8000-000000000109",
        revisionId: ids.revision,
        expectedVersion: 4,
        idempotencyKey: ids.idempotency,
      }),
    ).toEqual({
      name: "publish_latest_draft_revision",
      args: {
        p_commission_id: ids.commission,
        p_design_draft_id: "00000000-0000-4000-8000-000000000109",
        p_draft_revision_id: ids.revision,
        p_expected_revision_number: 4,
        p_idempotency_key: ids.idempotency,
      },
    });
    expect(availableAdminTransitions("in_progress")).not.toContain(
      "draft_review",
    );
  });

  it("opens aftercare and its first case through one customer RPC", () => {
    expect(
      createOpenAftercareRpcCommand({
        commissionId: ids.commission,
        clientRequestId: "00000000-0000-4000-8000-000000000110",
        category: "care",
        subject: "Annual inspection",
        description: "Inspect the setting and clean the piece.",
        idempotencyKey: ids.idempotency,
      }).name,
    ).toBe("open_aftercare_case");
  });

  it("contains no forbidden direct customer workflow writes", () => {
    const source = readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "src",
        "features",
        "customer",
        "actions.ts",
      ),
      "utf8",
    );
    expect(source).not.toContain('rpc("transition_commission_status"');
    expect(source).not.toMatch(
      /\.from\("draft_revisions"\)[\s\S]{0,120}\.update\(/,
    );
    expect(source).not.toMatch(
      /\.from\("draft_feedback"\)[\s\S]{0,120}\.insert\(/,
    );
    expect(source).not.toMatch(
      /\.from\("quote_counteroffers"\)[\s\S]{0,120}\.insert\(/,
    );
    expect(source).not.toMatch(/\.from\("messages"\)[\s\S]{0,120}\.insert\(/);
    expect(source).not.toMatch(
      /\.from\("message_attachments"\)[\s\S]{0,120}\.insert\(/,
    );
  });

  it("creates quote options with a zero deposit and rejects client deposit fields", () => {
    const source = readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "src",
        "features",
        "admin",
        "quote-actions.ts",
      ),
      "utf8",
    );
    expect(source).toContain(".strict()");
    expect(source).toContain("deposit_minor: 0");
    expect(source).not.toMatch(/\bdeposit:\s*decimalMinorSchema/);
  });

  it("checks provider amount limits before quote sending and counteroffers", () => {
    const adminActions = readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "src",
        "features",
        "admin",
        "actions.ts",
      ),
      "utf8",
    );
    const customerActions = readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "src",
        "features",
        "customer",
        "actions.ts",
      ),
      "utf8",
    );

    expect(adminActions).toContain('.select("deposit_minor,total_minor")');
    expect(adminActions).toContain(
      "!isProviderSupportedMinorAmount(option.total_minor)",
    );
    expect(customerActions).toContain(
      "decimalMinorSchema.refine(isProviderSupportedMinorAmount",
    );
  });

  it("leaves accepted-counteroffer selection authority to accept_quote", () => {
    const customerActions = readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "src",
        "features",
        "customer",
        "actions.ts",
      ),
      "utf8",
    );
    const acceptance = customerActions.match(
      /export async function acceptQuoteAction[\s\S]*?const draftDecisionSchema/,
    )?.[0];

    expect(acceptance).toBeDefined();
    expect(acceptance).toContain('rpc("accept_quote"');
    expect(acceptance).not.toContain("NEGOTIATED_SELECTION_REQUIRED");
    expect(acceptance).not.toContain('.eq("status", "accepted")');
  });

  it("uses the atomic decision RPC instead of direct decision inserts", () => {
    const adminActions = readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "src",
        "features",
        "admin",
        "actions.ts",
      ),
      "utf8",
    );
    const decision = adminActions.match(
      /export async function decideCounterofferAction[\s\S]*?const transitionSchema/,
    )?.[0];

    expect(decision).toBeDefined();
    expect(decision).toContain('rpc("decide_counteroffer"');
    expect(decision).not.toContain(
      '.from("quote_counteroffer_decisions").insert',
    );
  });
});
