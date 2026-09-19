import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  type AdminSyncClient,
  AdminSyncError,
  parseAdminSyncEnvironment,
  runAdminSync,
  syncAdminAllowlist,
} from "../../../scripts/sync-admin";

const USER_ID = "7d255b26-1cf2-4d1d-b2cf-ec65027cfd42";
const ADMIN_EMAIL = "admin@example.com";
const SERVICE_ROLE_KEY = "service-role-token-that-must-never-be-logged";

function googleUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: ADMIN_EMAIL,
    email_confirmed_at: "2026-09-17T00:00:00.000Z",
    phone: "",
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: {},
    identities: [
      {
        identity_id: "9e248564-5c06-4f59-9574-c943ea87f47d",
        id: USER_ID,
        user_id: USER_ID,
        identity_data: { email: ADMIN_EMAIL, sub: USER_ID },
        provider: "google",
        created_at: "2026-09-17T00:00:00.000Z",
        updated_at: "2026-09-17T00:00:00.000Z",
        last_sign_in_at: "2026-09-17T00:00:00.000Z",
      },
    ],
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    is_anonymous: false,
    ...overrides,
  };
}

function unconfirmedGoogleUser(): User {
  const user = googleUser();
  delete user.email_confirmed_at;
  return user;
}

function createMockClient(options: {
  users?: User[];
  rpcData?: unknown;
  rpcError?: unknown;
}) {
  const listUsers = vi.fn().mockResolvedValue({
    data: {
      users: options.users ?? [googleUser()],
      aud: "authenticated",
      nextPage: null,
      lastPage: 1,
      total: options.users?.length ?? 1,
    },
    error: null,
  });
  const rpc = vi.fn().mockResolvedValue({
    data: options.rpcData ?? [
      {
        target_user_id: USER_ID,
        normalized_email: ADMIN_EMAIL,
        changed: true,
      },
    ],
    error: options.rpcError ?? null,
  });

  return {
    client: {
      auth: { admin: { listUsers } },
      rpc,
    } as unknown as AdminSyncClient,
    listUsers,
    rpc,
  };
}

function validEnvironment() {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    ADMIN_GOOGLE_EMAIL: `  ${ADMIN_EMAIL.toUpperCase()}  `,
  };
}

describe("admin allowlist synchronization", () => {
  it("normalizes ADMIN_GOOGLE_EMAIL and sends the exact RPC payload", async () => {
    const environment = parseAdminSyncEnvironment(validEnvironment());
    const { client, rpc } = createMockClient({});

    expect(environment.adminEmail).toBe(ADMIN_EMAIL);
    await expect(
      syncAdminAllowlist(client, environment.adminEmail),
    ).resolves.toEqual({
      userId: USER_ID,
      changed: true,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("sync_admin_allowlist", {
      p_normalized_email: ADMIN_EMAIL,
    });
  });

  it("returns an idempotent retry result when no state changes", async () => {
    const { client } = createMockClient({
      rpcData: [
        {
          target_user_id: USER_ID,
          normalized_email: ADMIN_EMAIL,
          changed: false,
        },
      ],
    });

    await expect(syncAdminAllowlist(client, ADMIN_EMAIL)).resolves.toEqual({
      userId: USER_ID,
      changed: false,
    });
  });

  it("reports an unchanged retry as a successful safe CLI result", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const { client } = createMockClient({
      rpcData: [
        {
          target_user_id: USER_ID,
          normalized_email: ADMIN_EMAIL,
          changed: false,
        },
      ],
    });

    await expect(
      runAdminSync({
        environment: validEnvironment(),
        createClient: () => client,
        logger,
      }),
    ).resolves.toBe(0);

    const logs = JSON.stringify(logger.info.mock.calls);
    expect(logs).toContain("admin.sync_already_current");
    expect(logs).not.toContain(ADMIN_EMAIL);
    expect(logs).not.toContain(SERVICE_ROLE_KEY);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("fails explicitly when the RPC errors", async () => {
    const { client } = createMockClient({
      rpcData: null,
      rpcError: {
        message: `${ADMIN_EMAIL} ${SERVICE_ROLE_KEY}`,
      },
    });

    await expect(syncAdminAllowlist(client, ADMIN_EMAIL)).rejects.toMatchObject(
      {
        code: "ALLOWLIST_SYNC_FAILED",
        message: "Unable to synchronize the administrator allowlist.",
      },
    );
  });

  it.each([
    {
      users: [],
      code: "ADMIN_USER_NOT_FOUND" as const,
    },
    {
      users: [googleUser(), googleUser({ id: crypto.randomUUID() })],
      code: "ADMIN_USER_AMBIGUOUS" as const,
    },
  ])("fails explicitly for $code", async ({ users, code }) => {
    const { client, rpc } = createMockClient({ users });

    await expect(syncAdminAllowlist(client, ADMIN_EMAIL)).rejects.toMatchObject<
      Partial<AdminSyncError>
    >({ code });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    unconfirmedGoogleUser(),
    googleUser({ identities: [] }),
    googleUser({
      identities: [
        {
          identity_id: "9e248564-5c06-4f59-9574-c943ea87f47d",
          id: USER_ID,
          user_id: USER_ID,
          identity_data: { email: ADMIN_EMAIL, sub: USER_ID },
          provider: "email",
          created_at: "2026-09-17T00:00:00.000Z",
          updated_at: "2026-09-17T00:00:00.000Z",
          last_sign_in_at: "2026-09-17T00:00:00.000Z",
        },
      ],
    }),
  ])("rejects a user without a confirmed Google identity", async (user) => {
    const { client, rpc } = createMockClient({ users: [user] });

    await expect(syncAdminAllowlist(client, ADMIN_EMAIL)).rejects.toMatchObject(
      {
        code: "GOOGLE_IDENTITY_REQUIRED",
      },
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never logs the configured email, token, or provider error details", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const { client } = createMockClient({
      rpcData: null,
      rpcError: {
        message: `${ADMIN_EMAIL} ${SERVICE_ROLE_KEY} database details`,
      },
    });

    await expect(
      runAdminSync({
        environment: validEnvironment(),
        createClient: () => client,
        logger,
      }),
    ).resolves.toBe(1);

    const logs = JSON.stringify([
      ...logger.info.mock.calls,
      ...logger.error.mock.calls,
    ]);
    expect(logs).not.toContain(ADMIN_EMAIL);
    expect(logs).not.toContain(SERVICE_ROLE_KEY);
    expect(logs).not.toContain("database details");
    expect(logs).toContain("ALLOWLIST_SYNC_FAILED");
  });
});
