import { spawnSync } from "node:child_process";
import path from "node:path";

const npmExecutable = process.env.npm_execpath;
if (!npmExecutable) {
  throw new Error("Run E2E through `npm run test:e2e`.");
}

const e2eEnvironment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "replace-with-e2e-supabase-url",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "replace-with-e2e-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "replace-with-e2e-service-role-key",
};

const build = spawnSync(process.execPath, [npmExecutable, "run", "build"], {
  env: e2eEnvironment,
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
        ...e2eEnvironment,
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
