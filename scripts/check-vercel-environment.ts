import { validateVercelEnvironment } from "@/lib/security/vercel-environment";

const target = process.argv[2];
if (target !== "preview" && target !== "production") {
  throw new Error("Expected Vercel target: preview or production.");
}

const summary = validateVercelEnvironment(process.env, target);

console.log(
  [
    `Vercel ${summary.target} environment is valid.`,
    `track=${summary.deploymentTrack}`,
    `origin=${summary.applicationOrigin}`,
    `supabase=${summary.supabaseOrigin}`,
    `stripe=${summary.stripeMode}`,
    `email=${summary.emailEnabled ? "enabled" : "disabled"}`,
  ].join(" "),
);
