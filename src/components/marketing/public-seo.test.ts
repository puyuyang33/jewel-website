import { describe, expect, it } from "vitest";

import { getPublicPortfolioProjects } from "./content";
import {
  buildPublicSitemap,
  createPortfolioProjectMetadata,
} from "./public-seo";

describe("public portfolio metadata", () => {
  it("uses the published slug, excerpt, and media endpoint", () => {
    const fixture = getPublicPortfolioProjects()[0];
    if (!fixture) throw new Error("Expected a public portfolio fixture");
    const project = {
      ...fixture,
      media: [
        {
          id: "20000000-0000-4000-8000-000000000001",
          url: "/api/portfolio-media/20000000-0000-4000-8000-000000000001/open",
          altText: "Pale sapphire ring viewed from above",
          width: 1_600,
          height: 1_200,
          sortOrder: 10,
        },
      ],
    };

    const metadata = createPortfolioProjectMetadata(project);

    expect(metadata.title).toBe("Orrery No. 3");
    expect(metadata.description).toBe(project.excerpt);
    expect(metadata.alternates?.canonical).toBe("/portfolio/orrery-no-3");
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({
        url: project.media[0]?.url,
        alt: project.media[0]?.altText,
      }),
    ]);
  });

  it("adds stable sitemap entries for the supplied published slugs", () => {
    const projects = getPublicPortfolioProjects().slice(0, 2);

    const sitemap = buildPublicSitemap("https://atelier.example/", projects);

    expect(
      sitemap
        .map((entry) => entry.url)
        .filter((url) => url.includes("/portfolio/")),
    ).toEqual([
      "https://atelier.example/portfolio/orrery-no-3",
      "https://atelier.example/portfolio/house-light",
    ]);
    expect(
      sitemap.find(
        (entry) =>
          entry.url === "https://atelier.example/portfolio/orrery-no-3",
      ),
    ).toMatchObject({
      lastModified: new Date("2026-06-20T00:00:00.000Z"),
      changeFrequency: "monthly",
      priority: 0.85,
    });
  });
});
