// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createSupabaseUploadStore,
  createUploadPostHandler,
  type UploadStore,
} from "@/app/api/uploads/route";
import type { AuthenticatedUserDto } from "@/lib/auth/dal";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";
import { ProtocolError } from "@/app/api/uploads/_lib/protocol";

const ids = {
  user: "10000000-0000-4000-8000-000000000001",
  target: "20000000-0000-4000-8000-000000000001",
  client: "30000000-0000-4000-8000-000000000001",
  metadata: "40000000-0000-4000-8000-000000000001",
};

const customer: AuthenticatedUserDto = {
  id: ids.user,
  email: "customer@example.com",
  displayName: "Customer",
  role: "client",
};

const admin: AuthenticatedUserDto = {
  ...customer,
  role: "admin",
};

function multipartRequest(
  purpose: "request" | "message" | "draft" | "portfolio",
): Request {
  const formData = new FormData();
  formData.set("purpose", purpose);
  formData.set("targetId", ids.target);
  formData.set("clientId", ids.client);
  if (purpose === "portfolio") {
    formData.set("altText", "A normalized jewelry image");
  }
  formData.set(
    "file",
    new Blob([new Uint8Array([1, 2, 3])], {
      type: "image/png",
    }),
    "ring.png",
  );
  return new Request("https://atelier.example/api/uploads", {
    method: "POST",
    headers: { Origin: "https://atelier.example" },
    body: formData,
  });
}

function store(overrides: Partial<UploadStore> = {}): UploadStore {
  return {
    authorize: vi.fn().mockResolvedValue({
      pathOwnerId: ids.user,
      currentAssetCount: 0,
      existingMetadataId: null,
    }),
    findExistingByPath: vi.fn().mockResolvedValue(null),
    upload: vi.fn().mockResolvedValue(undefined),
    verifyMessageObject: vi.fn().mockResolvedValue(true),
    registerMessage: vi.fn().mockResolvedValue({
      id: ids.metadata,
      created: true,
    }),
    persist: vi.fn().mockResolvedValue(ids.metadata),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function handler(
  uploadStore: UploadStore,
  authenticatedUser: AuthenticatedUserDto = customer,
  requireAdmin = vi.fn().mockResolvedValue(admin),
) {
  const normalize = vi.fn().mockResolvedValue({
    bytes: Buffer.from([4, 5, 6]),
    mimeType: "image/webp" as const,
    extension: "webp" as const,
    width: 640,
    height: 480,
  });
  return {
    requireAdmin,
    normalize,
    post: createUploadPostHandler({
      assertOrigin: vi.fn(),
      requireUser: vi.fn().mockResolvedValue(authenticatedUser),
      requireAdmin,
      enforceRateLimit: vi.fn(),
      createStore: vi.fn().mockResolvedValue(uploadStore),
      normalize,
    }),
  };
}

describe("POST /api/uploads", () => {
  it("uses service role for Storage and metadata mutations", async () => {
    const userFrom = vi.fn();
    const upload = vi.fn().mockResolvedValue({ error: null });
    const storageFrom = vi.fn().mockReturnValue({ upload });
    const single = vi.fn().mockResolvedValue({
      data: { id: ids.metadata },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const serviceFrom = vi.fn().mockReturnValue({ insert });
    const uploadStore = createSupabaseUploadStore(
      { from: userFrom } as unknown as VeyraSupabaseClient,
      {
        from: serviceFrom,
        storage: { from: storageFrom },
      } as unknown as VeyraSupabaseClient,
    );
    const image = {
      bucket: "commission-private" as const,
      path: `${ids.user}/project/${ids.client}.webp`,
      bytes: Buffer.from([4, 5, 6]),
      mimeType: "image/webp" as const,
      sha256Hex: "a".repeat(64),
      width: 640,
      height: 480,
    };

    await uploadStore.upload(image);
    await expect(
      uploadStore.persist({
        request: {
          purpose: "request",
          targetId: ids.target,
          clientId: ids.client,
          altText: null,
        },
        user: customer,
        authorization: {
          pathOwnerId: ids.user,
          currentAssetCount: 0,
          existingMetadataId: null,
        },
        image,
        fileName: "ring.webp",
      }),
    ).resolves.toBe(ids.metadata);

    expect(storageFrom).toHaveBeenCalledWith("commission-private");
    expect(upload).toHaveBeenCalledOnce();
    expect(serviceFrom).toHaveBeenCalledWith("design_request_attachments");
    expect(insert).toHaveBeenCalledOnce();
    expect(userFrom).not.toHaveBeenCalled();
  });

  it("registers verified message metadata only through the service RPC", async () => {
    const userFrom = vi.fn();
    const rpc = vi.fn().mockResolvedValue({
      data: [{ attachment_id: ids.metadata, created: true }],
      error: null,
    });
    const uploadStore = createSupabaseUploadStore(
      { from: userFrom } as unknown as VeyraSupabaseClient,
      { rpc } as unknown as VeyraSupabaseClient,
    );

    await expect(
      uploadStore.registerMessage({
        request: {
          purpose: "message",
          targetId: ids.target,
          clientId: ids.client,
          altText: null,
        },
        user: customer,
        authorization: {
          pathOwnerId: ids.user,
          currentAssetCount: 0,
          existingMetadataId: null,
        },
        image: {
          bucket: "commission-private",
          path: `${ids.user}/message/${ids.client}.webp`,
          bytes: Buffer.from([4, 5, 6]),
          mimeType: "image/webp",
          sha256Hex: "a".repeat(64),
          width: 640,
          height: 480,
        },
        fileName: "ring.webp",
      }),
    ).resolves.toEqual({ id: ids.metadata, created: true });
    expect(rpc).toHaveBeenCalledWith("register_message_attachment_upload", {
      p_owner_id: ids.user,
      p_client_attachment_id: ids.client,
      p_object_path: `${ids.user}/message/${ids.client}.webp`,
      p_file_name: "ring.webp",
      p_mime_type: "image/webp",
      p_byte_size: 3,
      p_sha256_hex: "a".repeat(64),
    });
    expect(userFrom).not.toHaveBeenCalled();
  });

  it("normalizes and persists a private message image without returning a URL", async () => {
    const uploadStore = store();
    const { post, requireAdmin } = handler(uploadStore);

    const response = await post(multipartRequest("message"));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(uploadStore.authorize).toHaveBeenCalledWith(
      {
        purpose: "message",
        targetId: ids.target,
        clientId: ids.client,
        altText: null,
      },
      customer,
    );
    expect(uploadStore.upload).toHaveBeenCalledOnce();
    expect(uploadStore.registerMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: expect.stringMatching(/\.webp$/u),
      }),
    );
    expect(uploadStore.persist).not.toHaveBeenCalled();
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(body).toEqual({
      upload: {
        id: ids.metadata,
        purpose: "message",
        mimeType: "image/webp",
        byteSize: 3,
        width: 640,
        height: 480,
        reused: false,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/https?:\/\//u);
    expect(JSON.stringify(body)).not.toContain("commission-private");
  });

  it("replays message registration when deterministic storage already exists", async () => {
    const uploadStore = store({
      upload: vi
        .fn()
        .mockRejectedValue(new ProtocolError("DEPENDENCY_UNAVAILABLE")),
      registerMessage: vi.fn().mockResolvedValue({
        id: ids.metadata,
        created: false,
      }),
    });
    const { post } = handler(uploadStore);

    const response = await post(multipartRequest("message"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      upload: {
        id: ids.metadata,
        purpose: "message",
        reused: true,
      },
    });
    expect(uploadStore.registerMessage).toHaveBeenCalledOnce();
    expect(uploadStore.verifyMessageObject).toHaveBeenCalledOnce();
    expect(uploadStore.remove).not.toHaveBeenCalled();
    expect(uploadStore.persist).not.toHaveBeenCalled();
  });

  it("rejects an existing message object that does not match normalized bytes", async () => {
    const uploadStore = store({
      upload: vi
        .fn()
        .mockRejectedValue(new ProtocolError("DEPENDENCY_UNAVAILABLE")),
      verifyMessageObject: vi.fn().mockResolvedValue(false),
    });
    const { post } = handler(uploadStore);

    const response = await post(multipartRequest("message"));

    expect(response.status).toBe(503);
    expect(uploadStore.registerMessage).not.toHaveBeenCalled();
    expect(uploadStore.remove).not.toHaveBeenCalled();
  });

  it.each(["draft", "portfolio"] as const)(
    "requires trusted admin authorization for %s uploads",
    async (purpose) => {
      const uploadStore = store();
      const requireAdmin = vi
        .fn()
        .mockRejectedValue(new ProtocolError("FORBIDDEN"));
      const { post } = handler(uploadStore, customer, requireAdmin);

      const response = await post(multipartRequest(purpose));

      expect(response.status).toBe(403);
      expect(requireAdmin).toHaveBeenCalledOnce();
      expect(uploadStore.authorize).not.toHaveBeenCalled();
      expect(uploadStore.upload).not.toHaveBeenCalled();
    },
  );

  it("removes a stored object when metadata persistence is rejected", async () => {
    const uploadStore = store({
      persist: vi
        .fn()
        .mockRejectedValue(new ProtocolError("DEPENDENCY_UNAVAILABLE")),
    });
    const { post } = handler(uploadStore);

    const response = await post(multipartRequest("request"));
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(uploadStore.upload).toHaveBeenCalledOnce();
    expect(uploadStore.remove).toHaveBeenCalledOnce();
    expect(body).not.toMatch(/https?:\/\//u);
    expect(body).not.toContain("commission-private");
  });

  it("does not delete a deterministic object when its upload was rejected", async () => {
    const uploadStore = store({
      upload: vi
        .fn()
        .mockRejectedValue(new ProtocolError("DEPENDENCY_UNAVAILABLE")),
    });
    const { post } = handler(uploadStore, admin);

    const response = await post(multipartRequest("draft"));

    expect(response.status).toBe(503);
    expect(uploadStore.remove).not.toHaveBeenCalled();
    expect(uploadStore.persist).not.toHaveBeenCalled();
  });

  it("returns an idempotent attachment result without writing another object", async () => {
    const uploadStore = store({
      authorize: vi.fn().mockResolvedValue({
        pathOwnerId: ids.user,
        currentAssetCount: 1,
        existingMetadataId: ids.metadata,
      }),
    });
    const { post } = handler(uploadStore);

    const response = await post(multipartRequest("request"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      upload: {
        id: ids.metadata,
        purpose: "request",
        reused: true,
      },
    });
    expect(uploadStore.upload).not.toHaveBeenCalled();
    expect(uploadStore.persist).not.toHaveBeenCalled();
  });

  it.each(["draft", "portfolio"] as const)(
    "replays a %s upload from its stable client-bound object path",
    async (purpose) => {
      const uploadStore = store({
        findExistingByPath: vi.fn().mockResolvedValue({
          id: ids.metadata,
          targetMatches: true,
        }),
      });
      const { post, normalize } = handler(uploadStore, admin);

      const response = await post(multipartRequest(purpose));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        upload: {
          id: ids.metadata,
          purpose,
          reused: true,
        },
      });
      expect(uploadStore.findExistingByPath).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose,
          targetId: ids.target,
          clientId: ids.client,
        }),
        `${ids.user}/${purpose === "draft" ? "project" : "portfolio"}/${ids.client}.webp`,
      );
      expect(normalize).not.toHaveBeenCalled();
      expect(uploadStore.upload).not.toHaveBeenCalled();
      expect(uploadStore.persist).not.toHaveBeenCalled();
    },
  );

  it("rejects an oversized multipart request before authorization or decoding", async () => {
    const uploadStore = store();
    const { post } = handler(uploadStore);
    const request = multipartRequest("request");
    request.headers.set("Content-Length", String(5 * 1024 * 1024));

    const response = await post(request);

    expect(response.status).toBe(413);
    expect(uploadStore.authorize).not.toHaveBeenCalled();
    expect(uploadStore.upload).not.toHaveBeenCalled();
  });
});
