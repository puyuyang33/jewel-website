import { spawnSync } from "node:child_process";

import { validateVercelEnvironment } from "@/lib/security/vercel-environment";

const vercelEnvironment = process.env.VERCEL_ENV;
if (vercelEnvironment !== "preview" && vercelEnvironment !== "production") {
  throw new Error(
    "VERCEL_ENV is missing. Enable Vercel System Environment Variables for Preview and Production.",
  );
}

validateVercelEnvironment(process.env, vercelEnvironment);

const npmExecutable = process.env.npm_execpath;
if (!npmExecutable) {
  throw new Error("Vercel build must run through `npm run build:vercel`.");
}

const result = spawnSync(process.execPath, [npmExecutable, "run", "build"], {
  env: process.env,
  stdio: "inherit",
});
if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
