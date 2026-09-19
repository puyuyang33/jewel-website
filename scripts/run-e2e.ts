import { spawnSync } from "node:child_process";
import path from "node:path";

const npmExecutable = process.env.npm_execpath;
if (!npmExecutable) {
  throw new Error("Run E2E through `npm run test:e2e`.");
}

const build = spawnSync(process.execPath, [npmExecutable, "run", "build"], {
  env: process.env,
  stdio: "inherit",
});

if (build.error) {
  throw build.error;
}
if (build.status !== 0) {
  process.exitCode = build.status ?? 1;
} else {
  const playwrightCli = path.resolve(
    "node_modules",
    "@playwright",
    "test",
    "cli.js",
  );
  const forwardedArguments = process.argv
    .slice(2)
    .filter((argument) => argument !== "--");
  const tests = spawnSync(
    process.execPath,
    [playwrightCli, "test", ...forwardedArguments],
    {
      env: {
        ...process.env,
        PLAYWRIGHT_SERVER_COMMAND: "npm run start",
      },
      stdio: "inherit",
    },
  );

  if (tests.error) {
    throw tests.error;
  }
  process.exitCode = tests.status ?? 1;
}
