import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["run", "build"], {
  env: {
    ...process.env,
    NEXT_PUBLIC_DEPLOYMENT_TRACK: "free-demo",
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
