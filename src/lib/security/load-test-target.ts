export function validateRealtimeLoadTarget({
  expectedProjectRef,
  productionProjectRef,
  supabaseUrl,
}: {
  expectedProjectRef: string;
  productionProjectRef: string;
  supabaseUrl: string;
}) {
  const expected = normalizeProjectRef(
    expectedProjectRef,
    "LOAD_TEST_EXPECTED_PROJECT_REF",
  );
  const production = normalizeProjectRef(
    productionProjectRef,
    "LOAD_TEST_PRODUCTION_PROJECT_REF",
  );

  if (expected === production) {
    throw new Error(
      "The expected load-test project must differ from the production project.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error("LOAD_TEST_SUPABASE_URL must be a valid URL.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.hostname.toLowerCase() !== `${expected}.supabase.co`
  ) {
    throw new Error(
      "LOAD_TEST_SUPABASE_URL must exactly match the approved non-production Supabase project ref.",
    );
  }

  return parsed.origin;
}

function normalizeProjectRef(value: string, name: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9]{8,40}$/u.test(normalized)) {
    throw new Error(`${name} is not a valid Supabase project ref.`);
  }
  return normalized;
}
