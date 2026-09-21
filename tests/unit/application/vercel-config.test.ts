// @vitest-environment node

import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Vercel project configuration", () => {
  it("disables Git-triggered deployments without overriding Next.js Proxy", async () => {
    const configuration = JSON.parse(
      await readFile(new URL("../../../vercel.json", import.meta.url), "utf8"),
    ) as {
      buildCommand?: string;
      framework?: string;
      git?: { deploymentEnabled?: boolean };
      installCommand?: string;
      proxy?: unknown;
    };

    expect(configuration).toMatchObject({
      buildCommand: "npm run build:vercel",
      framework: "nextjs",
      git: { deploymentEnabled: false },
      installCommand: "npm ci",
    });
    expect(configuration.proxy).toBeUndefined();
  });

  it("pins only the audited native Vercel CLI", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(manifest.devDependencies?.["@vercel/vc-native"]).toBe("59.23.2");
    expect(manifest.devDependencies?.vercel).toBeUndefined();
    expect(manifest.scripts?.["vercel:deploy:preview"]).toContain(
      "deploy-preview",
    );
    expect(manifest.scripts?.["vercel:deploy:candidate"]).toContain(
      "deploy-candidate",
    );
  });

  it("excludes secrets and non-runtime artifacts from source deployments", async () => {
    const ignoreRules = await readFile(
      new URL("../../../.vercelignore", import.meta.url),
      "utf8",
    );

    expect(ignoreRules).toMatch(/^\.env\*$/mu);
    expect(ignoreRules).toMatch(/^\*\.pem$/mu);
    expect(ignoreRules).toMatch(/^\*\.sql$/mu);
    expect(ignoreRules).toMatch(/^\*\.tsbuildinfo$/mu);
    expect(ignoreRules).toMatch(/^next-env\.d\.ts$/mu);
    expect(ignoreRules).toMatch(/^supabase$/mu);
    expect(ignoreRules).toMatch(/^tests$/mu);
    expect(ignoreRules).toMatch(/^test-results$/mu);
    expect(ignoreRules).toMatch(/^node_modules$/mu);
  });
});
