import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { validateRealtimeLoadTarget } from "@/lib/security/load-test-target";

const confirmation = process.env.LOAD_TEST_CONFIRM_NON_PRODUCTION;
if (confirmation !== "I_UNDERSTAND") {
  throw new Error(
    "Refusing to run. Set LOAD_TEST_CONFIRM_NON_PRODUCTION=I_UNDERSTAND only for an approved non-production project.",
  );
}

const supabaseUrl = process.env.LOAD_TEST_SUPABASE_URL;
const supabaseAnonKey = process.env.LOAD_TEST_SUPABASE_ANON_KEY;
const accessToken = process.env.LOAD_TEST_ACCESS_TOKEN;
const expectedProjectRef = process.env.LOAD_TEST_EXPECTED_PROJECT_REF;
const productionProjectRef = process.env.LOAD_TEST_PRODUCTION_PROJECT_REF;
const connectionCount = readPositiveInteger("LOAD_TEST_CONNECTIONS", 300, 500);
const holdSeconds = readPositiveInteger("LOAD_TEST_HOLD_SECONDS", 30, 300);

if (
  !supabaseUrl ||
  !supabaseAnonKey ||
  !accessToken ||
  !expectedProjectRef ||
  !productionProjectRef
) {
  throw new Error(
    "LOAD_TEST_SUPABASE_URL, LOAD_TEST_SUPABASE_ANON_KEY, LOAD_TEST_ACCESS_TOKEN, LOAD_TEST_EXPECTED_PROJECT_REF, and LOAD_TEST_PRODUCTION_PROJECT_REF are required.",
  );
}

const verifiedSupabaseUrl = validateRealtimeLoadTarget({
  expectedProjectRef,
  productionProjectRef,
  supabaseUrl,
});
const verifiedSupabaseAnonKey = supabaseAnonKey;
const verifiedAccessToken = accessToken;

function readPositiveInteger(name: string, fallback: number, maximum: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

interface ConnectionHandle {
  index: number;
  client: SupabaseClient;
  channel: RealtimeChannel;
}

function createConnection(index: number): ConnectionHandle {
  const client = createClient(verifiedSupabaseUrl, verifiedSupabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 2,
      },
    },
  });
  client.realtime.setAuth(verifiedAccessToken);

  const channel = client.channel(`capacity-smoke-${index}`).on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages",
    },
    () => undefined,
  );

  return { index, client, channel };
}

function subscribe(connection: ConnectionHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Connection ${connection.index} timed out.`));
    }, 20_000);

    connection.channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        clearTimeout(timeout);
        reject(
          new Error(`Connection ${connection.index} ended with ${status}.`),
        );
      }
    });
  });
}

async function cleanUpConnection(connection: ConnectionHandle): Promise<void> {
  const results = await connection.client.removeAllChannels();
  const failedResult = results.find((result) => result !== "ok");
  if (failedResult) {
    throw new Error(
      `Connection ${connection.index} cleanup ended with ${failedResult}.`,
    );
  }
}

console.log(
  `Opening ${connectionCount} approved non-production Realtime connections.`,
);

const connections = Array.from({ length: connectionCount }, (_, index) =>
  createConnection(index),
);
const settled = await Promise.allSettled(
  connections.map((connection) => subscribe(connection)),
);
const connectedCount = settled.filter(
  (result) => result.status === "fulfilled",
).length;
const failures = settled.flatMap((result) =>
  result.status === "rejected"
    ? [result.reason instanceof Error ? result.reason.message : "Unknown error"]
    : [],
);

console.log(
  `Connected ${connectedCount}/${connectionCount}; holding for ${holdSeconds} seconds.`,
);

let cleanupFailures: string[] = [];
try {
  await new Promise((resolve) => setTimeout(resolve, holdSeconds * 1_000));
} finally {
  const cleanup = await Promise.allSettled(
    connections.map((connection) => cleanUpConnection(connection)),
  );
  cleanupFailures = cleanup.flatMap((result) =>
    result.status === "rejected"
      ? [
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown cleanup error",
        ]
      : [],
  );
}

const allFailures = [...failures, ...cleanupFailures];
if (allFailures.length > 0) {
  console.error(allFailures.slice(0, 10).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Realtime connection smoke completed successfully.");
}
