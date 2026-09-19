import { readFile } from "node:fs/promises";

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface LockPackage {
  resolved?: string;
}

interface PackageLock {
  packages?: Record<string, LockPackage>;
}

const forbiddenNamePatterns = [/^@deere(?:\/|$)/i, /john-?deere/i];
const forbiddenSourcePatterns = [
  /npm\.deere\.com/i,
  /deereandcompany/i,
  /artifactory\/api\/npm/i,
];
const publicRegistryPrefix = "https://registry.npmjs.org/";

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as PackageManifest;
const lockText = await readFile(
  new URL("../package-lock.json", import.meta.url),
  "utf8",
);
const lock = JSON.parse(lockText) as PackageLock;

const dependencyNames = [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
];

const forbiddenNames = dependencyNames.filter((name) =>
  forbiddenNamePatterns.some((pattern) => pattern.test(name)),
);
const forbiddenSources = forbiddenSourcePatterns.filter((pattern) =>
  pattern.test(lockText),
);
const nonPublicResolvedSources = Object.entries(lock.packages ?? {}).flatMap(
  ([packagePath, value]) => {
    const resolved = value.resolved;
    if (!resolved || resolved.startsWith(publicRegistryPrefix)) {
      return [];
    }
    return [`${packagePath || "<root>"}: ${resolved}`];
  },
);

const failures = [
  ...forbiddenNames.map((name) => `Forbidden dependency name: ${name}`),
  ...forbiddenSources.map(
    (pattern) => `Forbidden package source pattern: ${pattern.source}`,
  ),
  ...nonPublicResolvedSources.map(
    (source) => `Non-public resolved package source: ${source}`,
  ),
];

if (failures.length > 0) {
  console.error("Public dependency verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Public dependency verification passed for ${dependencyNames.length} direct packages.`,
  );
}
