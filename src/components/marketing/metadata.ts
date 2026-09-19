import type { Metadata } from "next";

export function createMarketingMetadata(
  title: string,
  description: string,
  canonical: `/${string}` | "/",
): Metadata {
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
