import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { SupabaseConfigurationResult } from "@/lib/supabase/config";
import type { Database, Tables } from "@/types/database.generated";

import {
  loadPublicPortfolioContent,
  loadPublicSiteSettings,
  mapPublishedPortfolio,
  portfolioMediaUrl,
  type PublicContentLoaderDependencies,
  type PublicContentRepository,
} from "./public-content";

const configured = {
  configured: true,
  value: {
    url: "https://project.supabase.co",
    anonKey: "public-anon-key-long-enough-for-tests",
  },
  missing: [],
} as const satisfies SupabaseConfigurationResult;

const unconfigured = {
  configured: false,
  value: null,
  missing: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
} as const satisfies SupabaseConfigurationResult;

function project(
  overrides: Partial<Tables<"portfolio_projects">> = {},
): Tables<"portfolio_projects"> {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "north-window-ring",
    title: "North Window Ring",
    excerpt: "A pale sapphire ring inspired by winter light.",
    story: "A low architectural setting developed around a remembered window.",
    materials: ["recycled platinum", "pale sapphire"],
    techniques: ["hand fabrication"],
    status: "published",
    is_featured: true,
    sort_order: 10,
    completed_on: "2026-01-14",
    published_at: "2026-01-20T00:00:00.000Z",
    created_by: null,
    created_at: "2026-01-10T00:00:00.000Z",
    updated_at: "2026-01-21T00:00:00.000Z",
    ...overrides,
  };
}

function media(
  overrides: Partial<Tables<"portfolio_media">> = {},
): Tables<"portfolio_media"> {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    portfolio_project_id: "10000000-0000-4000-8000-000000000001",
    bucket_id: "portfolio-public",
    object_path: "local-fixtures/north-window-ring.webp",
    media_type: "image",
    alt_text: "Platinum ring with a pale oval sapphire",
    width: 1_600,
    height: 1_200,
    blurhash: null,
    sort_order: 10,
    created_at: "2026-01-20T00:00:00.000Z",
    ...overrides,
  };
}

type PublicSettingsRow =
  Database["public"]["Functions"]["get_public_site_settings"]["Returns"][number];

function setting(
  overrides: Partial<PublicSettingsRow> = {},
): PublicSettingsRow {
  return {
    intake_open: true,
    quote_validity_days: 21,
    brand_name: "Veyra Managed Atelier",
    contact_email: "hello@veyra.example",
    contact_phone: "+44 20 7946 0991",
    ...overrides,
  };
}

function repository(
  overrides: Partial<PublicContentRepository> = {},
): PublicContentRepository {
  return {
    listPortfolioProjects: vi.fn().mockResolvedValue({ data: [], error: null }),
    listPortfolioMedia: vi.fn().mockResolvedValue({ data: [], error: null }),
    readPublicSiteSettings: vi
      .fn()
      .mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
}

function dependencies(
  store: PublicContentRepository,
  configuration: SupabaseConfigurationResult = configured,
  hasConfigurationIntent = configuration.configured,
): PublicContentLoaderDependencies {
  return {
    getConfiguration: vi.fn(() => configuration),
    hasConfigurationIntent: vi.fn(() => hasConfigurationIntent),
    createRepository: vi.fn(() => store),
    logFailure: vi.fn(),
  };
}

describe("public portfolio content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps only published projects and image media in stable order", async () => {
    const secondProject = project({
      id: "10000000-0000-4000-8000-000000000002",
      slug: "tideline-pendant",
      title: "Tideline Pendant",
      excerpt: "A pendant carrying a remembered shoreline.",
      story: "A reversible pendant developed from a contour drawing.",
      is_featured: false,
      sort_order: 20,
      completed_on: null,
      published_at: "2026-02-20T00:00:00.000Z",
      updated_at: "2026-02-21T00:00:00.000Z",
    });
    const draft = project({
      id: "10000000-0000-4000-8000-000000000003",
      slug: "private-draft",
      status: "draft",
      published_at: null,
    });
    const store = repository({
      listPortfolioProjects: vi.fn().mockResolvedValue({
        data: [secondProject, draft, project()],
        error: null,
      }),
      listPortfolioMedia: vi.fn().mockResolvedValue({
        data: [
          media({ sort_order: 20 }),
          media({
            id: "20000000-0000-4000-8000-000000000002",
            sort_order: 5,
            alt_text: "Side profile of the pale sapphire setting",
          }),
          media({
            id: "20000000-0000-4000-8000-000000000003",
            media_type: "video",
          }),
          media({
            id: "20000000-0000-4000-8000-000000000004",
            portfolio_project_id: draft.id,
          }),
        ],
        error: null,
      }),
    });
    const deps = dependencies(store);

    const result = await loadPublicPortfolioContent(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe("database");
    expect(result.data.projects.map((item) => item.slug)).toEqual([
      "north-window-ring",
      "tideline-pendant",
    ]);
    expect(result.data.projects[0]).toMatchObject({
      category: "Rings",
      year: "2026",
      materials: ["recycled platinum", "pale sapphire"],
    });
    expect(result.data.projects[1]?.category).toBe("Necklaces");
    expect(result.data.projects[0]?.media).toEqual([
      expect.objectContaining({
        id: "20000000-0000-4000-8000-000000000002",
        altText: "Side profile of the pale sapphire setting",
        url: "/api/portfolio-media/20000000-0000-4000-8000-000000000002/open",
      }),
      expect.objectContaining({
        id: "20000000-0000-4000-8000-000000000001",
      }),
    ]);
    expect(store.listPortfolioMedia).toHaveBeenCalledWith([
      secondProject.id,
      project().id,
    ]);
  });

  it("does not substitute fixtures when a configured project query fails", async () => {
    const rawFailure = {
      message: "relation internals and credentials must never reach the page",
    };
    const store = repository({
      listPortfolioProjects: vi
        .fn()
        .mockResolvedValue({ data: null, error: rawFailure }),
    });
    const deps = dependencies(store);

    const result = await loadPublicPortfolioContent(deps);

    expect(result).toEqual({
      ok: false,
      code: "PUBLIC_CONTENT_UNAVAILABLE",
      message:
        "The published portfolio is temporarily unavailable. Please try again later.",
    });
    expect(store.listPortfolioMedia).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("relation internals");
    expect(deps.logFailure).toHaveBeenCalledWith("portfolio", "projects");
  });

  it("does not substitute fixtures when a configured media query fails", async () => {
    const store = repository({
      listPortfolioProjects: vi
        .fn()
        .mockResolvedValue({ data: [project()], error: null }),
      listPortfolioMedia: vi.fn().mockResolvedValue({
        data: null,
        error: new Error("storage metadata"),
      }),
    });

    const result = await loadPublicPortfolioContent(dependencies(store));

    expect(result.ok).toBe(false);
    expect(store.listPortfolioMedia).toHaveBeenCalledOnce();
  });

  it("uses original fixtures only when Supabase is not configured", async () => {
    const store = repository();
    const deps = dependencies(store, unconfigured);

    const result = await loadPublicPortfolioContent(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe("development-fallback");
    expect(result.data.projects[0]?.slug).toBe("orrery-no-3");
    expect(deps.createRepository).not.toHaveBeenCalled();
  });

  it("does not use fixtures for a partial or invalid configuration", async () => {
    const deps = dependencies(repository(), unconfigured, true);

    const result = await loadPublicPortfolioContent(deps);

    expect(result.ok).toBe(false);
    expect(deps.createRepository).not.toHaveBeenCalled();
    expect(deps.logFailure).toHaveBeenCalledWith("portfolio", "configuration");
  });

  it("keeps a successful configured empty archive empty", async () => {
    const result = await loadPublicPortfolioContent(dependencies(repository()));

    expect(result).toEqual({
      ok: true,
      data: { source: "database", projects: [] },
    });
  });

  it("accepts PostgREST timestamptz offsets while preserving Z timestamps", async () => {
    const store = repository({
      listPortfolioProjects: vi.fn().mockResolvedValue({
        data: [
          project({
            published_at: "2026-09-17T12:00:00+00:00",
            updated_at: "2026-09-17T17:30:00+05:30",
          }),
          project({
            id: "10000000-0000-4000-8000-000000000002",
            slug: "zulu-study",
            is_featured: false,
            published_at: "2026-09-16T12:00:00.000Z",
            updated_at: "2026-09-16T12:30:00Z",
          }),
        ],
        error: null,
      }),
    });

    const result = await loadPublicPortfolioContent(dependencies(store));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.projects).toHaveLength(2);
    expect(result.data.projects[0]).toMatchObject({
      slug: "north-window-ring",
      publishedAt: "2026-09-17T12:00:00+00:00",
      updatedAt: "2026-09-17T17:30:00+05:30",
    });
    expect(result.data.projects[1]).toMatchObject({
      slug: "zulu-study",
      publishedAt: "2026-09-16T12:00:00.000Z",
      updatedAt: "2026-09-16T12:30:00Z",
    });
  });

  it.each([
    ["published_at", { published_at: "2026-09-17 12:00:00" }],
    ["updated_at", { updated_at: "September 17, 2026" }],
  ])("fails safely for an invalid %s timestamp", async (_, override) => {
    const deps = dependencies(
      repository({
        listPortfolioProjects: vi.fn().mockResolvedValue({
          data: [project(override)],
          error: null,
        }),
      }),
    );

    const result = await loadPublicPortfolioContent(deps);

    expect(result).toEqual({
      ok: false,
      code: "PUBLIC_CONTENT_UNAVAILABLE",
      message:
        "The published portfolio is temporarily unavailable. Please try again later.",
    });
    expect(deps.logFailure).toHaveBeenCalledWith("portfolio", "mapping");
  });

  it("creates stable same-origin media endpoint URLs", () => {
    expect(portfolioMediaUrl("20000000-0000-4000-8000-000000000001")).toBe(
      "/api/portfolio-media/20000000-0000-4000-8000-000000000001/open",
    );
  });

  it("filters unpublished rows even if a repository returns them", () => {
    const mapped = mapPublishedPortfolio(
      [
        project(),
        project({
          id: "10000000-0000-4000-8000-000000000002",
          slug: "draft-study",
          status: "draft",
          published_at: null,
        }),
      ],
      [],
    );

    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.slug).toBe("north-window-ring");
  });

  it("treats category hints as presentation data and preserves an uncategorized fallback", () => {
    const hinted = project({
      title: "Paired Lines",
      excerpt: "Two suspended forms.",
      story: "A study in movement.",
      materials: ["recycled platinum"],
      techniques: ["category: earrings", "articulated construction"],
    });
    const uncategorized = project({
      id: "10000000-0000-4000-8000-000000000002",
      slug: "quiet-study",
      title: "Quiet Study",
      excerpt: "A measured composition.",
      story: "An exploration of balance and negative space.",
      materials: ["recycled gold"],
      techniques: ["hand finishing"],
    });

    const mapped = mapPublishedPortfolio([uncategorized, hinted], []);

    expect(mapped.map(({ slug, category }) => ({ slug, category }))).toEqual([
      { slug: "north-window-ring", category: "Earrings" },
      { slug: "quiet-study", category: "Uncategorized" },
    ]);
    expect(mapped[0]?.techniques).toEqual(["articulated construction"]);
  });

  it("strips malformed and unknown category descriptors without using their words for inference", () => {
    const mapped = mapPublishedPortfolio(
      [
        project({
          title: "Quiet Study",
          excerpt: "A measured composition.",
          story: "An exploration of balance.",
          materials: ["recycled gold", "category: mystery ring"],
          techniques: ["category - earrings", "hand finishing"],
        }),
      ],
      [],
    );

    expect(mapped[0]).toMatchObject({
      category: "Uncategorized",
      materials: ["recycled gold"],
      techniques: ["hand finishing"],
    });
  });
});

describe("public site settings", () => {
  it("maps only the typed published singleton and keeps config-only fields", async () => {
    const store = repository({
      readPublicSiteSettings: vi
        .fn()
        .mockResolvedValue({ data: setting(), error: null }),
    });

    const result = await loadPublicSiteSettings(dependencies(store));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe("database");
    expect(result.data.settings.brandName).toBe("Veyra Managed Atelier");
    expect(result.data.settings.contactEmail).toBe("hello@veyra.example");
    expect(result.data.settings.contactPhone).toBe("+44 20 7946 0991");
    expect(result.data.settings.intakeOpen).toBe(true);
    expect(result.data.settings.quoteValidityDays).toBe(21);
    expect(result.data.settings.contactLocation).toBe(
      "By appointment, worldwide",
    );
    expect(store.readPublicSiteSettings).toHaveBeenCalledOnce();
  });

  it("surfaces a configured settings query failure without config fallback", async () => {
    const deps = dependencies(
      repository({
        readPublicSiteSettings: vi
          .fn()
          .mockResolvedValue({ data: null, error: new Error("query failed") }),
      }),
    );

    const result = await loadPublicSiteSettings(deps);

    expect(result).toEqual({
      ok: false,
      code: "PUBLIC_CONTENT_UNAVAILABLE",
      message:
        "Published studio details are temporarily unavailable. Please try again later.",
    });
    expect(deps.logFailure).toHaveBeenCalledWith("settings", "query");
  });

  it("uses central configuration only when Supabase is absent", async () => {
    const deps = dependencies(repository(), unconfigured);

    const result = await loadPublicSiteSettings(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe("configuration-fallback");
    expect(result.data.settings.brandName).toBe("Veyra Atelier");
    expect(deps.createRepository).not.toHaveBeenCalled();
  });

  it("uses central configuration when the public singleton is unpublished", async () => {
    const deps = dependencies(repository());

    const result = await loadPublicSiteSettings(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe("configuration-fallback");
    expect(result.data.settings.contactEmail).toBe("studio@example.com");
    expect(deps.createRepository).toHaveBeenCalledOnce();
  });

  it("fails safely for an invalid typed RPC value", async () => {
    const deps = dependencies(
      repository({
        readPublicSiteSettings: vi.fn().mockResolvedValue({
          data: setting({ contact_email: "not-an-email" }),
          error: null,
        }),
      }),
    );

    const result = await loadPublicSiteSettings(deps);

    expect(result.ok).toBe(false);
    expect(deps.logFailure).toHaveBeenCalledWith("settings", "mapping");
  });
});
