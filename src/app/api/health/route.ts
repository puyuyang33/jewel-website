import { noStoreJson } from "@/lib/http/response";
import { deployment } from "@/config/deployment";
import { isEmailConfiguredForEnvironment } from "@/lib/email/resend";
import {
  getStripeApplicationOrigin,
  StripeConfigurationError,
  stripeModeForEnvironment,
  validateStripeSecretKey,
  validateStripeWebhookSecret,
} from "@/lib/payments/config";
import { getSupabaseConfiguration } from "@/lib/supabase/config";
import { getSupabaseServiceConfiguration } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function hasValidStripeConfiguration() {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return false;
  }
  try {
    validateStripeSecretKey(
      process.env.STRIPE_SECRET_KEY,
      stripeModeForEnvironment(),
    );
    validateStripeWebhookSecret(process.env.STRIPE_WEBHOOK_SECRET);
    getStripeApplicationOrigin();
    return true;
  } catch (error) {
    if (error instanceof StripeConfigurationError) {
      return false;
    }
    throw error;
  }
}

function hasValidSupabaseConfiguration() {
  return (
    getSupabaseConfiguration().configured &&
    getSupabaseServiceConfiguration().configured
  );
}

export function GET() {
  return noStoreJson({
    status: "ok",
    service: "veyra-atelier",
    deploymentTrack: deployment.track,
    timestamp: new Date().toISOString(),
    integrations: {
      supabase: hasValidSupabaseConfiguration(),
      stripe: hasValidStripeConfiguration(),
      email: isEmailConfiguredForEnvironment(),
    },
  });
}
