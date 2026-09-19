import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPortfolioMediaOpenHandler,
  createSupabasePortfolioMediaRepository,
  type PortfolioMediaRepository,
  type PublishedPortfolioMediaRecord,
} from "@/app/api/portfolio-media/[id]/open/route";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";

const mediaId = "10000000-0000-4000-8000-000000000001";
const objectPath = "local-fixtures/north-window-ring.webp";
const signedUrl =
  "https://project.supabase.co/storage/v1/object/sign/portfolio-public/" +
  `${objectPath}?token=never-reflect-this`;

function media(
  overrides: Partial<PublishedPortfolioMediaRecord> = {},
): PublishedPortfolioMediaRecord {
  return {
    id: mediaId,
    bucket: "portfolio-public",
    objectPath,
    mediaType: "image",
    projectStatus: "published",
    projectPublishedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

function repository(
  record: PublishedPortfolioMediaRecord | null,
): PortfolioMediaRepository {
  return {
    findById: vi.fn().mockResolvedValue(record),
    createSignedUrl: vi.fn().mockResolvedValue(signedUrl),
  };
}

function invoke(store: PortfolioMediaRepository) {
  const handler = createPortfolioMediaOpenHandler({
    createRepository: vi.fn().mockResolvedValue(store),
    storageOrigin: () => "https://project.supabase.co",
  });
  return handler(
    new Request(`https://atelier.example/api/portfolio-media/${mediaId}/open`),
    { params: Promise.resolve({ id: mediaId }) },
  );
}

describe("GET /api/portfolio-media/[id]/open", () => {
  it("anonymously redirects published media through a signed private URL", async () => {
    const store = repository(media());

    const response = await invoke(store);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(signedUrl);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toBe("");
    expect(store.createSignedUrl).toHaveBeenCalledOnce();
  });

  it.each([
    ["draft", media({ projectStatus: "draft", projectPublishedAt: null })],
    [
      "archived",
      media({
        projectStatus: "archived",
        projectPublishedAt: "2026-09-01T00:00:00.000Z",
      }),
    ],
    [
      "unpublished",
      media({ projectStatus: "published", projectPublishedAt: null }),
    ],
  ])(
    "denies %s project media without signing or leaking it",
    async (_, row) => {
      const store = repository(row);

      const response = await invoke(store);
      const body = await response.text();

      expect(response.status).toBe(404);
      expect(store.createSignedUrl).not.toHaveBeenCalled();
      expect(body).not.toContain(objectPath);
      expect(body).not.toContain(signedUrl);
      expect(body).not.toContain("never-reflect-this");
    },
  );

  it("returns the same leak-safe response for missing media", async () => {
    const store = repository(null);

    const response = await invoke(store);
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(store.createSignedUrl).not.toHaveBeenCalled();
    expect(body).not.toContain(objectPath);
    expect(body).not.toContain("supabase.co");
  });

  it("uses only service-role storage after metadata authorization", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl },
      error: null,
    });
    const from = vi.fn().mockReturnValue({ createSignedUrl });
    const store = createSupabasePortfolioMediaRepository(
      {} as VeyraSupabaseClient,
      {
        storage: { from },
      } as unknown as VeyraSupabaseClient,
    );
    const record = media();

    await expect(store.createSignedUrl(record)).resolves.toBe(signedUrl);
    expect(from).toHaveBeenCalledWith("portfolio-public");
    expect(createSignedUrl).toHaveBeenCalledWith(objectPath, 300);
  });
});
