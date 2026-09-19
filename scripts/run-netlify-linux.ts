import { spawnSync } from "node:child_process";
import path from "node:path";

import { validateDistinctNetlifySiteIds } from "@/lib/security/netlify-sites";

const command = process.argv[2];
const siteIds =
  command === "preview" || command === "production"
    ? requireDistinctSiteIds()
    : null;
const commands: Record<string, () => string[]> = {
  build: () => ["build", "--offline"],
  preview: () => [
    "deploy",
    "--site",
    siteIds?.preview ?? "",
    "--context",
    "production",
    "--prod",
  ],
  production: () => [
    "deploy",
    "--site",
    siteIds?.demo ?? "",
    "--context",
    "production",
    "--prod",
  ],
};

const createArgs = command ? commands[command] : undefined;
if (!createArgs) {
  throw new Error("Expected one of: build, preview, production.");
}

const runtimeReport = process.report.getReport() as {
  header?: { glibcVersionRuntime?: unknown };
};
const glibcVersion = runtimeReport.header?.glibcVersionRuntime;

if (
  process.platform !== "linux" ||
  process.arch !== "x64" ||
  typeof glibcVersion !== "string"
) {
  throw new Error(
    "Netlify OpenNext packaging and manual deploys must run from Linux x64 with glibc so native sharp artifacts match the Netlify function runtime.",
  );
}

const netlifyBinary = path.resolve("node_modules", ".bin", "netlify");
const result = spawnSync(netlifyBinary, createArgs(), {
  env: {
    ...process.env,
    NEXT_PUBLIC_DEPLOYMENT_TRACK: "free-demo",
  },
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;

function requireSiteId(
  name: "NETLIFY_PREVIEW_SITE_ID" | "NETLIFY_DEMO_SITE_ID",
) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for this manual Netlify deployment.`);
  }
  return value;
}

function requireDistinctSiteIds() {
  return validateDistinctNetlifySiteIds(
    requireSiteId("NETLIFY_PREVIEW_SITE_ID"),
    requireSiteId("NETLIFY_DEMO_SITE_ID"),
  );
}
