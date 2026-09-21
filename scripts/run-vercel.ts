import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const expectedVersion = "59.23.2";
const command = process.argv[2];
const extraArguments = process.argv
  .slice(3)
  .filter((argument) => argument !== "--");

if (extraArguments.some((argument) => argument.startsWith("--token"))) {
  throw new Error(
    "Do not pass Vercel tokens on the command line. Use interactive login or VERCEL_TOKEN.",
  );
}

const binary = path.resolve(
  "node_modules",
  "@vercel",
  "vc-native",
  "bin",
  "vercel.exe",
);
if (!existsSync(binary)) {
  throw new Error(
    "Pinned Vercel native CLI is missing. Run npm ci on a supported Windows, macOS, or Linux host.",
  );
}

const version = spawnSync(binary, ["--version"], {
  encoding: "utf8",
  env: process.env,
});
if (version.error) {
  throw version.error;
}
const reportedVersion = `${version.stdout}\n${version.stderr}`;
if (version.status !== 0 || !reportedVersion.includes(expectedVersion)) {
  throw new Error(
    `Expected Vercel CLI ${expectedVersion}; received ${reportedVersion.trim() || "no version"}.`,
  );
}

const commands: Record<string, readonly string[]> = {
  doctor: ["--version"],
  login: ["login"],
  link: ["link"],
  "deploy-preview": ["deploy"],
  "deploy-candidate": ["deploy", "--prod", "--skip-domain"],
};

let argumentsToRun = command ? commands[command] : undefined;
if (command === "inspect" || command === "promote" || command === "rollback") {
  if (extraArguments.length !== 1) {
    throw new Error(`${command} requires exactly one Vercel deployment URL.`);
  }
  const deploymentUrl = new URL(extraArguments[0]!);
  if (
    deploymentUrl.protocol !== "https:" ||
    !deploymentUrl.hostname.endsWith(".vercel.app") ||
    deploymentUrl.pathname !== "/" ||
    deploymentUrl.search ||
    deploymentUrl.hash
  ) {
    throw new Error(
      `${command} requires an exact HTTPS *.vercel.app deployment URL.`,
    );
  }
  argumentsToRun = [command, deploymentUrl.origin];
}

if (
  !argumentsToRun ||
  (extraArguments.length > 0 &&
    !["inspect", "promote", "rollback"].includes(command ?? ""))
) {
  throw new Error(
    "Expected one of: doctor, login, link, deploy-preview, deploy-candidate, inspect, promote, rollback.",
  );
}

const result = spawnSync(binary, [...argumentsToRun], {
  env: process.env,
  stdio: "inherit",
});
if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
