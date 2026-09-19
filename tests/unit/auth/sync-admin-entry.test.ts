import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("admin sync executable", () => {
  it("starts through ESM and fails safely for invalid configuration", () => {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("node_modules/tsx/dist/cli.mjs"),
        path.resolve("scripts/sync-admin.ts"),
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ADMIN_GOOGLE_EMAIL: "invalid",
          NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
          SUPABASE_SERVICE_ROLE_KEY: "replace-with-invalid-key",
        },
        timeout: 20_000,
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CONFIGURATION_INVALID");
    expect(result.stderr).not.toContain("does not provide an export");
    expect(result.stderr).not.toContain("replace-with-invalid-key");
  }, 25_000);
});
