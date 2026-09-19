import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://veyra-atelier.example"
  ).replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/admin/", "/api/"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
