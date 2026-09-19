import { performance } from "node:perf_hooks";

const baseUrl = new URL(process.env.LOAD_TEST_URL ?? "http://127.0.0.1:3000");
const concurrency = readPositiveInteger("LOAD_TEST_CONCURRENCY", 300, 1_000);
const requestsPerClient = readPositiveInteger(
  "LOAD_TEST_REQUESTS_PER_CLIENT",
  3,
  100,
);
const timeoutMilliseconds = readPositiveInteger(
  "LOAD_TEST_TIMEOUT_MS",
  15_000,
  120_000,
);

interface RequestResult {
  durationMilliseconds: number;
  ok: boolean;
  status: number | null;
  error: string | null;
}

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

async function request(pathname: string): Promise<RequestResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);

  try {
    const response = await fetch(new URL(pathname, baseUrl), {
      signal: controller.signal,
      headers: {
        Accept: pathname === "/api/health" ? "application/json" : "text/html",
        "User-Agent": "veyra-non-production-load-smoke/1.0",
      },
    });
    await response.arrayBuffer();
    return {
      durationMilliseconds: performance.now() - startedAt,
      ok: response.ok,
      status: response.status,
      error: null,
    };
  } catch (error) {
    return {
      durationMilliseconds: performance.now() - startedAt,
      ok: false,
      status: null,
      error: error instanceof Error ? error.message : "Unknown request error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runClient(index: number) {
  const results: RequestResult[] = [];
  for (
    let requestIndex = 0;
    requestIndex < requestsPerClient;
    requestIndex += 1
  ) {
    const pathname = (index + requestIndex) % 2 === 0 ? "/api/health" : "/";
    results.push(await request(pathname));
  }
  return results;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ordered.length - 1,
    Math.ceil((percentileValue / 100) * ordered.length) - 1,
  );
  return ordered[index] ?? 0;
}

console.log(
  `Starting HTTP load smoke: ${concurrency} clients x ${requestsPerClient} requests against ${baseUrl.origin}.`,
);

const startedAt = performance.now();
const nestedResults = await Promise.all(
  Array.from({ length: concurrency }, (_, index) => runClient(index)),
);
const results = nestedResults.flat();
const failures = results.filter((result) => !result.ok);
const durations = results.map((result) => result.durationMilliseconds);
const elapsedSeconds = (performance.now() - startedAt) / 1_000;
const statusCounts = results.reduce<Record<string, number>>(
  (counts, result) => {
    const status = String(result.status ?? "network_error");
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  },
  {},
);

console.log(
  JSON.stringify(
    {
      clients: concurrency,
      requests: results.length,
      failures: failures.length,
      requestsPerSecond: Number((results.length / elapsedSeconds).toFixed(2)),
      p50Milliseconds: Number(percentile(durations, 50).toFixed(2)),
      p95Milliseconds: Number(percentile(durations, 95).toFixed(2)),
      p99Milliseconds: Number(percentile(durations, 99).toFixed(2)),
      statuses: statusCounts,
      sampleErrors: failures.slice(0, 5).map((result) => result.error),
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exitCode = 1;
}
