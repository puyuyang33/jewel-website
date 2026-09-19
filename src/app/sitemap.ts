import type { MetadataRoute } from "next";

import { getPublicPortfolioContent } from "@/components/marketing/public-content";
import { buildPublicSitemap } from "@/components/marketing/public-seo";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://veyra-atelier.example"
  ).replace(/\/$/, "");
  const portfolio = await getPublicPortfolioContent();

  return buildPublicSitemap(
    origin,
    portfolio.ok ? portfolio.data.projects : [],
  );
}
