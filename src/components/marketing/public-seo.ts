import type { Metadata, MetadataRoute } from "next";

import type { PortfolioProject } from "./content";
import { createMarketingMetadata } from "./metadata";

const publicRoutes = [
  "",
  "/portfolio",
  "/process",
  "/about",
  "/faq",
  "/contact",
  "/start",
  "/privacy",
  "/terms",
  "/payment-cancellation",
] as const;

export function createPortfolioProjectMetadata(
  project: PortfolioProject,
): Metadata {
  const canonical = `/portfolio/${project.slug}` as const;
  const base = createMarketingMetadata(
    project.title,
    project.excerpt,
    canonical,
  );
  const primaryMedia = project.media[0];

  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      ...(primaryMedia
        ? {
            images: [
              {
                url: primaryMedia.url,
                width: primaryMedia.width,
                height: primaryMedia.height,
                alt: primaryMedia.altText,
              },
            ],
          }
        : {}),
    },
  };
}

export function buildPublicSitemap(
  origin: string,
  projects: readonly PortfolioProject[],
): MetadataRoute.Sitemap {
  const normalizedOrigin = origin.replace(/\/$/, "");
  const staticEntries: MetadataRoute.Sitemap = publicRoutes.map(
    (route, index) => ({
      url: `${normalizedOrigin}${route}`,
      lastModified: new Date("2026-09-17"),
      changeFrequency:
        index === 0
          ? ("monthly" as const)
          : route === "/portfolio"
            ? ("monthly" as const)
            : ("yearly" as const),
      priority: index === 0 ? 1 : route === "/portfolio" ? 0.9 : 0.7,
    }),
  );
  const projectEntries: MetadataRoute.Sitemap = projects.map((project) => ({
    url: `${normalizedOrigin}/portfolio/${project.slug}`,
    lastModified: new Date(project.updatedAt),
    changeFrequency: "monthly",
    priority: project.featured ? 0.85 : 0.75,
  }));

  return [...staticEntries, ...projectEntries];
}
