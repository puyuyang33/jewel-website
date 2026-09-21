import type { NextConfig } from "next";

import { validateVercelEnvironment } from "./src/lib/security/vercel-environment";

const isDevelopment = process.env.NODE_ENV === "development";
const declaredVercelEnvironment = process.env.VEYRA_VERCEL_ENV;
if (
  (declaredVercelEnvironment === "preview" ||
    declaredVercelEnvironment === "production") &&
  process.env.VERCEL_ENV !== declaredVercelEnvironment
) {
  throw new Error(
    "Vercel System Environment Variables are missing or disagree with VEYRA_VERCEL_ENV.",
  );
}
if (
  process.env.VERCEL_ENV === "preview" ||
  process.env.VERCEL_ENV === "production"
) {
  validateVercelEnvironment(process.env, process.env.VERCEL_ENV);
}
const usesHttpsApplicationOrigin = (() => {
  try {
    return (
      typeof process.env.NEXT_PUBLIC_APP_URL === "string" &&
      new URL(process.env.NEXT_PUBLIC_APP_URL).protocol === "https:"
    );
  } catch {
    return false;
  }
})();
const localSupabaseConnections = isDevelopment
  ? " http://127.0.0.1:54321 ws://127.0.0.1:54321 http://localhost:54321 ws://localhost:54321"
  : "";
const localSupabaseImages = isDevelopment
  ? " http://127.0.0.1:54321 http://localhost:54321"
  : "";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: https://*.supabase.co${localSupabaseImages}`,
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://api.stripe.com${localSupabaseConnections}`,
  "frame-src 'self' https://checkout.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(usesHttpsApplicationOrigin ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
