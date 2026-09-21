import { spawnSync } from "node:child_process";

const npmExecutable = process.env.npm_execpath;
if (!npmExecutable) {
  throw new Error("Run the demo build through `npm run demo:build`.");
}

const result = spawnSync(process.execPath, [npmExecutable, "run", "build"], {
  env: {
    ...process.env,
    NEXT_PUBLIC_DEPLOYMENT_TRACK: "free-demo",
    NEXT_PUBLIC_SUPABASE_URL: "replace-with-demo-supabase-url",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "replace-with-demo-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "replace-with-demo-service-role-key",
  },
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
