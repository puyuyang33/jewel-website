import { readFile } from "node:fs/promises";

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface LockPackage {
  name?: string;
  resolved?: string;
}

interface PackageLock {
  packages?: Record<string, LockPackage>;
}

const forbiddenNamePatterns = [/^@deere(?:\/|$)/i, /john-?deere/i];
const forbiddenSourcePatterns = [
  /npm\.deere\.com/i,
  /deere(?:andcompany)?/i,
  /artifactory\/api\/npm/i,
];
const publicRegistryPrefix = "https://registry.npmjs.org/";
const forbiddenDependencySpecifiers =
  /^(?:file:|link:|git(?:\+|:)|github:|https?:|ssh:)/iu;

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as PackageManifest;
const lockText = await readFile(
  new URL("../package-lock.json", import.meta.url),
  "utf8",
);
const lock = JSON.parse(lockText) as PackageLock;
const npmConfiguration = await readFile(
  new URL("../.npmrc", import.meta.url),
  "utf8",
);
const npmRegistryAssignments = npmConfiguration
  .split(/\r?\n/u)
  .flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
      return [];
    }
    const separator = trimmed.indexOf("=");
    if (separator < 1) {
      return [];
    }
    return [
      {
        key: trimmed.slice(0, separator).trim().toLowerCase(),
        value: trimmed.slice(separator + 1).trim(),
      },
    ];
  })
  .filter(
    (assignment) =>
      assignment.key === "registry" || assignment.key.endsWith(":registry"),
  );
const defaultRegistryAssignments = npmRegistryAssignments.filter(
  (assignment) => assignment.key === "registry",
);
const scopedRegistryAssignments = npmRegistryAssignments.filter((assignment) =>
  assignment.key.endsWith(":registry"),
);

const declaredDependencies = {
  ...(manifest.dependencies ?? {}),
  ...(manifest.devDependencies ?? {}),
  ...(manifest.optionalDependencies ?? {}),
};
const dependencyNames = Object.keys(declaredDependencies);
const lockPackageNames = Object.entries(lock.packages ?? {}).flatMap(
  ([packagePath, value]) => {
    const inferredName = packagePath.split("node_modules/").at(-1);
    const name = value.name ?? inferredName;
    return name ? [name] : [];
  },
);

const forbiddenNames = [
  ...new Set([...dependencyNames, ...lockPackageNames]),
].filter((name) => forbiddenNamePatterns.some((pattern) => pattern.test(name)));
const forbiddenSpecifiers = Object.entries(declaredDependencies).flatMap(
  ([name, specifier]) =>
    forbiddenDependencySpecifiers.test(specifier)
      ? [`${name}: ${specifier}`]
      : [],
);
const forbiddenSources = forbiddenSourcePatterns.filter((pattern) =>
  pattern.test(`${lockText}\n${npmConfiguration}`),
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
  ...forbiddenSpecifiers.map(
    (specifier) => `Non-registry dependency specifier: ${specifier}`,
  ),
  ...forbiddenSources.map(
    (pattern) => `Forbidden package source pattern: ${pattern.source}`,
  ),
  ...nonPublicResolvedSources.map(
    (source) => `Non-public resolved package source: ${source}`,
  ),
  ...(defaultRegistryAssignments.length !== 1 ||
  defaultRegistryAssignments[0]?.value !== publicRegistryPrefix
    ? [
        "Project .npmrc must contain exactly one effective registry=https://registry.npmjs.org/ assignment",
      ]
    : []),
  ...(scopedRegistryAssignments.length > 0
    ? ["Scoped registries are not allowed in the project .npmrc"]
    : []),
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
