import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { z } from "zod";

import { brand } from "@/config/brand";
import {
  getSupabaseConfiguration,
  type SupabaseConfigurationResult,
  type SupabasePublicConfiguration,
} from "@/lib/supabase/config";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";
import { securityLogger } from "@/lib/security/logger";
import type { Database, Tables } from "@/types/database.generated";

import {
  getPublicPortfolioProjects,
  type ArtworkVariant,
  type PortfolioCategory,
  type PortfolioMedia,
  type PortfolioProject,
} from "./content";

type PortfolioProjectRow = Pick<
  Tables<"portfolio_projects">,
  | "id"
  | "slug"
  | "title"
  | "excerpt"
  | "story"
  | "materials"
  | "techniques"
  | "status"
  | "is_featured"
  | "sort_order"
  | "completed_on"
  | "published_at"
  | "updated_at"
>;

type PortfolioMediaRow = Pick<
  Tables<"portfolio_media">,
  | "id"
  | "portfolio_project_id"
  | "media_type"
  | "alt_text"
  | "width"
  | "height"
  | "sort_order"
>;

type PublicSiteSettingsRow =
  Database["public"]["Functions"]["get_public_site_settings"]["Returns"][number];

interface RepositoryResult<T> {
  readonly data: readonly T[] | null;
  readonly error: unknown;
}

interface RepositorySingleResult<T> {
  readonly data: T | null;
  readonly error: unknown;
}

export interface PublicContentRepository {
  listPortfolioProjects(): Promise<RepositoryResult<PortfolioProjectRow>>;
  listPortfolioMedia(
    projectIds: readonly string[],
  ): Promise<RepositoryResult<PortfolioMediaRow>>;
  readPublicSiteSettings(): Promise<
    RepositorySingleResult<PublicSiteSettingsRow>
  >;
}

export interface PublicSiteSettings {
  readonly brandName: string;
  readonly contactEmail: string;
  readonly contactPhone: string | null;
  readonly contactLocation: string;
  readonly intakeOpen: boolean;
  readonly quoteValidityDays: number;
}

export interface PublicPortfolioContent {
  readonly source: "database" | "development-fallback";
  readonly projects: readonly PortfolioProject[];
}

export interface PublicSettingsContent {
  readonly source: "database" | "configuration-fallback";
  readonly settings: PublicSiteSettings;
}

export type PublicContentResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code: "PUBLIC_CONTENT_UNAVAILABLE";
      readonly message: string;
    };

export interface PublicContentLoaderDependencies {
  readonly getConfiguration: () => SupabaseConfigurationResult;
  readonly hasConfigurationIntent: () => boolean;
  readonly createRepository: (
    configuration: SupabasePublicConfiguration,
  ) => PublicContentRepository;
  readonly logFailure: (scope: "portfolio" | "settings", stage: string) => void;
}

const projectRowSchema = z.object({
  id: z.uuid(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .max(160),
  title: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().min(1).max(500),
  story: z.string().trim().min(1).max(12_000),
  materials: z.array(z.string().trim().min(1).max(200)).max(50),
  techniques: z.array(z.string().trim().min(1).max(200)).max(50),
  status: z.literal("published"),
  is_featured: z.boolean(),
  sort_order: z.number().int(),
  completed_on: z.iso.date().nullable(),
  published_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

const mediaRowSchema = z.object({
  id: z.uuid(),
  portfolio_project_id: z.uuid(),
  media_type: z.literal("image"),
  alt_text: z.string().trim().min(1).max(300),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  sort_order: z.number().int(),
});

const publicSettingsSchema = z.object({
  intake_open: z.boolean(),
  quote_validity_days: z.number().int().min(1).max(90),
  brand_name: z.string().trim().min(1).max(120),
  contact_email: z.email().max(254),
  contact_phone: z.string().trim().max(40).nullable(),
});

const artworkVariants: readonly ArtworkVariant[] = [
  "orbit",
  "pendant",
  "twin",
  "arc",
  "signet",
  "relic",
];

function defaultSettings(): PublicSiteSettings {
  return {
    brandName: brand.name,
    contactEmail: brand.email,
    contactPhone: null,
    contactLocation: brand.location,
    intakeOpen: true,
    quoteValidityDays: 14,
  };
}

function artworkForSlug(slug: string): ArtworkVariant {
  const hash = [...slug].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return artworkVariants[hash % artworkVariants.length] ?? "orbit";
}

function categoryForProject(
  row: Pick<
    PortfolioProjectRow,
    "title" | "excerpt" | "story" | "materials" | "techniques"
  >,
): PortfolioCategory {
  const categoryAliases: Record<string, PortfolioCategory> = {
    ring: "Rings",
    rings: "Rings",
    necklace: "Necklaces",
    necklaces: "Necklaces",
    pendant: "Necklaces",
    earrings: "Earrings",
    earring: "Earrings",
    ceremonial: "Ceremonial",
    ceremony: "Ceremonial",
    object: "Objects",
    objects: "Objects",
    brooch: "Objects",
    uncategorized: "Uncategorized",
  };
  const explicitCategory = [...row.techniques, ...row.materials]
    .map((value) => /^category\s*:\s*(.+)$/iu.exec(value)?.[1]?.toLowerCase())
    .map((value) => (value ? categoryAliases[value] : undefined))
    .find((value): value is PortfolioCategory => value !== undefined);
  if (explicitCategory) {
    return explicitCategory;
  }

  const searchable = [
    row.title,
    row.excerpt,
    row.story,
    ...visibleDescriptors(row.materials),
    ...visibleDescriptors(row.techniques),
  ]
    .join(" ")
    .toLowerCase();
  if (/\b(earring|earrings|studs?)\b/u.test(searchable)) {
    return "Earrings";
  }
  if (/\b(necklace|necklaces|pendant|pendants|chain)\b/u.test(searchable)) {
    return "Necklaces";
  }
  if (/\b(ceremonial|ceremony|wedding|vow|commitment)\b/u.test(searchable)) {
    return "Ceremonial";
  }
  if (/\b(ring|rings|band|bands|signet)\b/u.test(searchable)) {
    return "Rings";
  }
  if (
    /\b(object|objects|brooch|brooches|pin|pins|talisman)\b/u.test(searchable)
  ) {
    return "Objects";
  }
  return "Uncategorized";
}

function visibleDescriptors(values: readonly string[]): readonly string[] {
  return values.filter((value) => !/^category\b/iu.test(value.trim()));
}

export function portfolioMediaUrl(id: string): string {
  return `/api/portfolio-media/${encodeURIComponent(id)}/open`;
}

export function mapPublishedPortfolio(
  projectRows: readonly PortfolioProjectRow[],
  mediaRows: readonly PortfolioMediaRow[],
): readonly PortfolioProject[] {
  const publishedRows = projectRows
    .filter((row) => row.status === "published" && row.published_at !== null)
    .map((row) => projectRowSchema.parse(row))
    .sort((left, right) => {
      if (left.is_featured !== right.is_featured) {
        return left.is_featured ? -1 : 1;
      }
      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
      }
      const publicationOrder = right.published_at.localeCompare(
        left.published_at,
      );
      return publicationOrder || left.id.localeCompare(right.id);
    });
  const publishedIds = new Set(publishedRows.map((row) => row.id));
  const mediaByProject = new Map<string, PortfolioMedia[]>();

  for (const mediaRow of mediaRows) {
    if (
      mediaRow.media_type !== "image" ||
      !publishedIds.has(mediaRow.portfolio_project_id)
    ) {
      continue;
    }
    const media = mediaRowSchema.parse(mediaRow);
    const items = mediaByProject.get(media.portfolio_project_id) ?? [];
    items.push({
      id: media.id,
      url: portfolioMediaUrl(media.id),
      altText: media.alt_text,
      width: media.width ?? 1_200,
      height: media.height ?? 1_500,
      sortOrder: media.sort_order,
    });
    mediaByProject.set(media.portfolio_project_id, items);
  }

  for (const items of mediaByProject.values()) {
    items.sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    );
  }

  return publishedRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: categoryForProject(row),
    excerpt: row.excerpt,
    story: row.story,
    materials: visibleDescriptors(row.materials),
    techniques: visibleDescriptors(row.techniques),
    featured: row.is_featured,
    sortOrder: row.sort_order,
    completedOn: row.completed_on,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    year: (row.completed_on ?? row.published_at).slice(0, 4),
    artwork: artworkForSlug(row.slug),
    media: mediaByProject.get(row.id) ?? [],
  }));
}

export function mapPublishedSettings(
  row: PublicSiteSettingsRow | null,
): PublicSettingsContent {
  const settings = defaultSettings();
  if (!row) {
    return {
      source: "configuration-fallback",
      settings,
    };
  }
  const published = publicSettingsSchema.parse(row);

  return {
    source: "database",
    settings: {
      ...settings,
      brandName: published.brand_name,
      contactEmail: published.contact_email,
      contactPhone: published.contact_phone,
      intakeOpen: published.intake_open,
      quoteValidityDays: published.quote_validity_days,
    },
  };
}

export function createSupabasePublicContentRepository(
  configuration: SupabasePublicConfiguration,
): PublicContentRepository {
  const client: VeyraSupabaseClient = createSupabaseClient(
    configuration.url,
    configuration.anonKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );

  return {
    async listPortfolioProjects() {
      return client
        .from("portfolio_projects")
        .select(
          "id,slug,title,excerpt,story,materials,techniques,status,is_featured,sort_order,completed_on,published_at,updated_at",
        )
        .eq("status", "published")
        .not("published_at", "is", null)
        .order("is_featured", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("published_at", { ascending: false })
        .order("id", { ascending: true });
    },
    async listPortfolioMedia(projectIds) {
      if (projectIds.length === 0) {
        return { data: [], error: null };
      }
      return client
        .from("portfolio_media")
        .select(
          "id,portfolio_project_id,media_type,alt_text,width,height,sort_order",
        )
        .in("portfolio_project_id", [...projectIds])
        .eq("media_type", "image")
        .order("portfolio_project_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
    },
    async readPublicSiteSettings() {
      const result = await client.rpc("get_public_site_settings");
      return {
        data: result.data?.[0] ?? null,
        error: result.error,
      };
    },
  };
}

const defaultDependencies: PublicContentLoaderDependencies = {
  getConfiguration: getSupabaseConfiguration,
  hasConfigurationIntent() {
    const values = [
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ];
    return values.some((value) => {
      const candidate = value?.trim();
      return Boolean(candidate && !/^replace-with-/iu.test(candidate));
    });
  },
  createRepository: createSupabasePublicContentRepository,
  logFailure(scope, stage) {
    securityLogger.error("public_content.read_failed", { scope, stage });
  },
};

function failure<T>(message: string): PublicContentResult<T> {
  return {
    ok: false,
    code: "PUBLIC_CONTENT_UNAVAILABLE",
    message,
  };
}

export async function loadPublicPortfolioContent(
  dependencies: PublicContentLoaderDependencies = defaultDependencies,
): Promise<PublicContentResult<PublicPortfolioContent>> {
  const configuration = dependencies.getConfiguration();
  if (!configuration.configured) {
    if (dependencies.hasConfigurationIntent()) {
      dependencies.logFailure("portfolio", "configuration");
      return failure(
        "The published portfolio is temporarily unavailable. Please try again later.",
      );
    }
    return {
      ok: true,
      data: {
        source: "development-fallback",
        projects: getPublicPortfolioProjects(),
      },
    };
  }

  try {
    const repository = dependencies.createRepository(configuration.value);
    const projectResult = await repository.listPortfolioProjects();
    if (projectResult.error) {
      dependencies.logFailure("portfolio", "projects");
      return failure(
        "The published portfolio is temporarily unavailable. Please try again later.",
      );
    }
    const publishedProjectRows = (projectResult.data ?? []).filter(
      (row) => row.status === "published" && row.published_at !== null,
    );
    const mediaResult = await repository.listPortfolioMedia(
      publishedProjectRows.map((row) => row.id),
    );
    if (mediaResult.error) {
      dependencies.logFailure("portfolio", "media");
      return failure(
        "The published portfolio is temporarily unavailable. Please try again later.",
      );
    }
    return {
      ok: true,
      data: {
        source: "database",
        projects: mapPublishedPortfolio(
          publishedProjectRows,
          mediaResult.data ?? [],
        ),
      },
    };
  } catch {
    dependencies.logFailure("portfolio", "mapping");
    return failure(
      "The published portfolio is temporarily unavailable. Please try again later.",
    );
  }
}

export async function loadPublicSiteSettings(
  dependencies: PublicContentLoaderDependencies = defaultDependencies,
): Promise<PublicContentResult<PublicSettingsContent>> {
  const configuration = dependencies.getConfiguration();
  if (!configuration.configured) {
    if (dependencies.hasConfigurationIntent()) {
      dependencies.logFailure("settings", "configuration");
      return failure(
        "Published studio details are temporarily unavailable. Please try again later.",
      );
    }
    return {
      ok: true,
      data: {
        source: "configuration-fallback",
        settings: defaultSettings(),
      },
    };
  }

  try {
    const repository = dependencies.createRepository(configuration.value);
    const result = await repository.readPublicSiteSettings();
    if (result.error) {
      dependencies.logFailure("settings", "query");
      return failure(
        "Published studio details are temporarily unavailable. Please try again later.",
      );
    }
    return {
      ok: true,
      data: mapPublishedSettings(result.data),
    };
  } catch {
    dependencies.logFailure("settings", "mapping");
    return failure(
      "Published studio details are temporarily unavailable. Please try again later.",
    );
  }
}

export const getPublicPortfolioContent = cache(loadPublicPortfolioContent);
export const getPublicSiteSettings = cache(loadPublicSiteSettings);
