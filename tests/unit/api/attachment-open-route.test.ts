import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createAttachmentOpenHandler,
  createSupabaseAttachmentRepository,
  type AttachmentRepository,
  type PrivateAttachmentAccessRecord,
} from "@/app/api/attachments/[id]/open/route";
import type { AuthenticatedUserDto } from "@/lib/auth/dal";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";

const ids = {
  customer: "10000000-0000-4000-8000-000000000001",
  otherCustomer: "10000000-0000-4000-8000-000000000002",
  admin: "10000000-0000-4000-8000-000000000003",
  attachment: "20000000-0000-4000-8000-000000000001",
  object: "30000000-0000-4000-8000-000000000001",
};

const customer: AuthenticatedUserDto = {
  id: ids.customer,
  email: "customer@example.com",
  displayName: "Customer",
  role: "client",
};

const admin: AuthenticatedUserDto = {
  id: ids.admin,
  email: "admin@example.com",
  displayName: "Admin",
  role: "admin",
};

const privatePath = `${ids.customer}/message/${ids.object}.webp`;
const signedUrl =
  `https://project.supabase.co/storage/v1/object/sign/commission-private/` +
  `${privatePath}?token=never-reflect-this`;

function record(
  overrides: Partial<PrivateAttachmentAccessRecord> = {},
): PrivateAttachmentAccessRecord {
  return {
    id: ids.attachment,
    kind: "message",
    bucket: "commission-private",
    objectPath: privatePath,
    customerId: ids.customer,
    ownerId: ids.customer,
    published: true,
    ...overrides,
  };
}

function repository(
  attachment: PrivateAttachmentAccessRecord | null,
): AttachmentRepository {
  return {
    findById: vi.fn().mockResolvedValue(attachment),
    createSignedUrl: vi.fn().mockResolvedValue(signedUrl),
  };
}

function invoke(
  attachmentRepository: AttachmentRepository,
  user: AuthenticatedUserDto,
  requireAdmin = vi.fn().mockResolvedValue(admin),
) {
  const handler = createAttachmentOpenHandler({
    requireUser: vi.fn().mockResolvedValue(user),
    requireAdmin,
    enforceRateLimit: vi.fn(),
    createRepository: vi.fn().mockResolvedValue(attachmentRepository),
    storageOrigin: () => "https://project.supabase.co",
  });
  return {
    requireAdmin,
    response: handler(
      new Request(
        `https://atelier.example/api/attachments/${ids.attachment}/open`,
      ),
      { params: Promise.resolve({ id: ids.attachment }) },
    ),
  };
}

describe("GET /api/attachments/[id]/open", () => {
  it("uses only the service-role storage client after authorization", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl },
      error: null,
    });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    const serviceClient = {
      storage: { from },
    } as unknown as VeyraSupabaseClient;
    const attachmentRepository = createSupabaseAttachmentRepository(
      {} as VeyraSupabaseClient,
      serviceClient,
    );
    const attachment = record();

    await expect(
      attachmentRepository.createSignedUrl(attachment),
    ).resolves.toBe(signedUrl);
    expect(from).toHaveBeenCalledWith("commission-private");
    expect(createSignedUrl).toHaveBeenCalledWith(privatePath, 300);
  });

  it("fails closed when an ID matches more than one attachment table", async () => {
    const rows: Record<string, object | null> = {
      message_attachments: {
        id: ids.attachment,
        message_id: "40000000-0000-4000-8000-000000000001",
        owner_id: ids.customer,
        bucket_id: "commission-private",
        object_path: privatePath,
      },
      design_request_attachments: {
        id: ids.attachment,
        design_request_id: "50000000-0000-4000-8000-000000000001",
        owner_id: ids.customer,
        bucket_id: "commission-private",
        object_path: `${ids.customer}/project/${ids.object}.webp`,
      },
      draft_revision_assets: null,
    };
    const from = vi.fn((table: string) => {
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: rows[table] ?? null,
          error: null,
        }),
      };
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      return builder;
    });
    const attachmentRepository = createSupabaseAttachmentRepository(
      { from } as unknown as VeyraSupabaseClient,
      {} as VeyraSupabaseClient,
    );

    await expect(
      attachmentRepository.findById(ids.attachment),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("redirects an owning customer to a short-lived private image URL", async () => {
    const store = repository(record());
    const { response, requireAdmin } = invoke(store, customer);
    const result = await response;

    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe(signedUrl);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await result.text()).toBe("");
    expect(store.createSignedUrl).toHaveBeenCalledOnce();
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("allows a verified admin to open a published draft asset", async () => {
    const store = repository(
      record({
        kind: "draft",
        customerId: ids.otherCustomer,
        ownerId: null,
        published: true,
        objectPath: `${ids.otherCustomer}/project/${ids.object}.webp`,
      }),
    );
    const { response, requireAdmin } = invoke(store, admin);
    const result = await response;

    expect(result.status).toBe(303);
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(store.createSignedUrl).toHaveBeenCalledOnce();
  });

  it("denies an unpublished draft asset even to an admin", async () => {
    const unpublishedPath = `${ids.otherCustomer}/project/${ids.object}.webp`;
    const store = repository(
      record({
        kind: "draft",
        customerId: ids.otherCustomer,
        ownerId: null,
        published: false,
        objectPath: unpublishedPath,
      }),
    );
    const { response } = invoke(store, admin);
    const result = await response;
    const body = await result.text();

    expect(result.status).toBe(404);
    expect(store.createSignedUrl).not.toHaveBeenCalled();
    expect(body).not.toContain(unpublishedPath);
  });

  it("denies a cross-customer attachment before signing it", async () => {
    const otherPath = `${ids.otherCustomer}/project/${ids.object}.webp`;
    const store = repository(
      record({
        kind: "request",
        customerId: ids.otherCustomer,
        ownerId: ids.otherCustomer,
        objectPath: otherPath,
      }),
    );
    const { response } = invoke(store, customer);
    const result = await response;
    const body = await result.text();

    expect(result.status).toBe(404);
    expect(store.createSignedUrl).not.toHaveBeenCalled();
    expect(body).not.toContain(otherPath);
    expect(body).not.toContain(signedUrl);
    expect(body).not.toContain("never-reflect-this");
  });

  it("returns the same leak-safe response for a missing attachment", async () => {
    const store = repository(null);
    const { response } = invoke(store, customer);
    const result = await response;
    const body = await result.text();

    expect(result.status).toBe(404);
    expect(store.createSignedUrl).not.toHaveBeenCalled();
    expect(body).not.toContain(privatePath);
    expect(body).not.toContain("supabase.co");
  });
});
