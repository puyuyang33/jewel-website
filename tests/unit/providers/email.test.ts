import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createDisabledEmailProvider,
  createEmailProviderFromEnvironment,
  createResendEmailProvider,
  getCommissionEmailTemplateEvents,
  renderCommissionEmail,
  type CommissionEmailInput,
  type ResendEmailClient,
} from "@/lib/email";
import { NOTIFICATION_EVENTS } from "@/types/domain";

const baseInput: CommissionEmailInput = {
  event: "draft_ready",
  entityId: "00000000-0000-4000-8000-000000000001",
  eventVersion: 4,
  recipientEmail: " Customer@Example.com ",
  recipientName: "Customer",
  authenticatedPath:
    "/commissions/00000000-0000-4000-8000-000000000001?tab=draft",
};

describe("commission email templates", () => {
  it("covers every required notification event with English safe copy", () => {
    expect(new Set(getCommissionEmailTemplateEvents())).toEqual(
      new Set(NOTIFICATION_EVENTS),
    );

    for (const event of NOTIFICATION_EVENTS) {
      const rendered = renderCommissionEmail(
        { ...baseInput, event },
        "https://atelier.example",
      );
      expect(rendered.subject).not.toBe("");
      expect(rendered.text).toContain("securely in your account");
      expect(rendered.html).toContain("securely in your account");
      expect(rendered.deepLink).toMatch(
        /^https:\/\/atelier\.example\/commissions\//u,
      );
      expect(rendered.html).not.toContain("attachment");
      expect(rendered.html).not.toContain("download");
    }
  });

  it("escapes personalized HTML and retains readable plain text", () => {
    const rendered = renderCommissionEmail(
      {
        ...baseInput,
        recipientName: '<Admin & "friend">',
        authenticatedPath:
          "/commissions/00000000-0000-4000-8000-000000000001?tab=a&view=b",
      },
      "https://atelier.example",
    );

    expect(rendered.html).toContain(
      "Hello &lt;Admin &amp; &quot;friend&quot;&gt;,",
    );
    expect(rendered.html).not.toContain('<Admin & "friend">');
    expect(rendered.html).toContain("tab=a&amp;view=b");
    expect(rendered.text).toContain('Hello <Admin & "friend">,');
  });

  it("allows only same-origin authenticated deep links", () => {
    expect(() =>
      renderCommissionEmail(
        {
          ...baseInput,
          authenticatedPath: "https://evil.example/commissions/1",
        },
        "https://atelier.example",
      ),
    ).toThrow();
    expect(() =>
      renderCommissionEmail(
        { ...baseInput, authenticatedPath: "/portfolio" },
        "https://atelier.example",
      ),
    ).toThrow(/authenticated/u);
    expect(() =>
      renderCommissionEmail(baseInput, "https://atelier.example/path"),
    ).toThrow(/origin/u);
  });
});

describe("transactional email providers", () => {
  it("returns an explicit disabled result without contacting a provider", async () => {
    const provider = createDisabledEmailProvider({
      applicationOrigin: "http://localhost:3000",
      reason: "local_delivery_disabled",
    });

    await expect(provider.send(baseInput)).resolves.toMatchObject({
      status: "disabled",
      reason: "local_delivery_disabled",
      idempotencyKey: expect.stringContaining("notification"),
    });
  });

  it("is local-safe and lazy when optional environment is absent", async () => {
    const provider = createEmailProviderFromEnvironment({
      NODE_ENV: "test",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
    await expect(provider.send(baseInput)).resolves.toMatchObject({
      status: "disabled",
      reason: "local_delivery_disabled",
    });
  });

  it("sends escaped HTML and text with a deterministic Resend key", async () => {
    const send = vi.fn().mockResolvedValue({
      data: { id: "email_123" },
      error: null,
    });
    const client = { emails: { send } } as ResendEmailClient;
    const provider = createResendEmailProvider({
      client,
      from: "Veyra Atelier <projects@example.com>",
      applicationOrigin: "https://atelier.example",
    });

    const first = await provider.send({
      ...baseInput,
      recipientName: "<Customer>",
    });
    const second = await provider.send({
      ...baseInput,
      recipientEmail: "customer@example.COM",
      recipientName: "<Customer>",
    });

    expect(first).toEqual({
      status: "sent",
      providerMessageId: "email_123",
      idempotencyKey: expect.stringContaining("notification"),
    });
    expect(second).toMatchObject({
      status: "sent",
      idempotencyKey:
        first.status === "sent" ? first.idempotencyKey : "unreachable",
    });
    expect(send).toHaveBeenCalledTimes(2);
    const [payload, options] = send.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(payload).toMatchObject({
      from: "Veyra Atelier <projects@example.com>",
      to: "customer@example.com",
      subject: "Your design draft is ready",
    });
    expect(payload.html).toContain("&lt;Customer&gt;");
    expect(payload).not.toHaveProperty("attachments");
    expect(payload).not.toHaveProperty("deliverableUrl");
    expect(options).toEqual({
      idempotencyKey:
        first.status === "sent" ? first.idempotencyKey : "unreachable",
    });
  });

  it("changes the dedupe key for a new event version", async () => {
    const send = vi.fn().mockResolvedValue({
      data: { id: "email_123" },
      error: null,
    });
    const provider = createResendEmailProvider({
      client: { emails: { send } },
      from: "projects@example.com",
      applicationOrigin: "https://atelier.example",
    });

    const first = await provider.send(baseInput);
    const next = await provider.send({ ...baseInput, eventVersion: 5 });
    expect(first.idempotencyKey).not.toBe(next.idempotencyKey);
  });

  it.each([
    [400, false],
    [429, true],
    [503, true],
    [null, true],
  ])(
    "maps provider HTTP status %s to retryable=%s",
    async (statusCode, retryable) => {
      const client: ResendEmailClient = {
        emails: {
          send: vi.fn().mockResolvedValue({
            data: null,
            error: {
              name: "provider_error",
              message: "Provider detail must not escape",
              statusCode,
            },
          }),
        },
      };
      const provider = createResendEmailProvider({
        client,
        from: "projects@example.com",
        applicationOrigin: "https://atelier.example",
      });

      await expect(provider.send(baseInput)).resolves.toEqual({
        status: "failed",
        code: "provider_error",
        retryable,
        idempotencyKey: expect.stringContaining("notification"),
      });
    },
  );

  it("maps thrown and malformed responses to explicit failures", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("secret provider response"))
      .mockResolvedValueOnce({ data: null, error: null });
    const provider = createResendEmailProvider({
      client: { emails: { send } },
      from: "projects@example.com",
      applicationOrigin: "https://atelier.example",
    });

    await expect(provider.send(baseInput)).resolves.toMatchObject({
      status: "failed",
      code: "provider_error",
      retryable: true,
    });
    await expect(provider.send(baseInput)).resolves.toMatchObject({
      status: "failed",
      code: "invalid_provider_response",
      retryable: true,
    });
  });

  it("returns explicit non-retryable failures for unsafe input or config", async () => {
    const send = vi.fn();
    const badConfigProvider = createResendEmailProvider({
      client: { emails: { send } },
      from: "bad\r\nBcc: attacker@example.com",
      applicationOrigin: "https://atelier.example",
    });
    const validConfigProvider = createResendEmailProvider({
      client: { emails: { send } },
      from: "projects@example.com",
      applicationOrigin: "https://atelier.example",
    });

    await expect(badConfigProvider.send(baseInput)).resolves.toEqual({
      status: "failed",
      code: "invalid_configuration",
      retryable: false,
      idempotencyKey: null,
    });
    await expect(
      validConfigProvider.send({
        ...baseInput,
        authenticatedPath: "//evil.example/account",
      }),
    ).resolves.toEqual({
      status: "failed",
      code: "invalid_input",
      retryable: false,
      idempotencyKey: null,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
