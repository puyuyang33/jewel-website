"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  actionFailure,
  decimalMinorSchema,
  optionalText,
  success,
  uuidSchema,
  validationFailure,
} from "@/features/application/action-utils";
import {
  isProviderSupportedMinorAmount,
  sumProviderSupportedMinorAmounts,
} from "@/features/application/payment-amount";
import { requireAdmin } from "@/lib/auth/dal";
import { isoCurrencySchema } from "@/lib/domain/money";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";

const supportedLineItemAmountSchema = decimalMinorSchema.refine(
  isProviderSupportedMinorAmount,
  {
    message: "Each line amount must be between 0.01 and 999,999.99",
  },
);

const lineItemSchema = z.object({
  description: z.string().trim().min(1).max(120),
  amount: supportedLineItemAmountSchema,
});

const quoteBuilderOptionSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(4_000),
    scope: z.string().trim().min(1).max(4_000),
    materials: z.string().trim().min(1).max(2_000),
    stoneAssumptions: z.string().trim().min(1).max(2_000),
    deliverables: z.string().trim().min(1).max(2_000),
    includedRevisionRounds: z.coerce.number().int().min(0).max(100),
    estimatedCompletionDays: z.coerce.number().int().min(1).max(3_650),
    lineItems: z.array(lineItemSchema).min(1).max(30),
  })
  .strict()
  .superRefine((option, context) => {
    if (
      sumProviderSupportedMinorAmounts(
        option.lineItems.map((lineItem) => lineItem.amount),
      ) === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["lineItems"],
        message: "Option total must be between 0.01 and 999,999.99",
      });
    }
  });

const quoteBuilderSchema = z.object({
  requestId: uuidSchema,
  sourceQuoteId: z.union([uuidSchema, z.literal("")]),
  title: z.string().trim().min(1).max(200),
  introduction: optionalText(5_000),
  terms: z.string().trim().min(1).max(10_000),
  currency: isoCurrencySchema,
  productionWeeks: z.coerce.number().int().min(1).max(104),
  options: z
    .string()
    .max(100_000)
    .transform((value, context) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({
          code: "custom",
          message: "Quote options are malformed",
        });
        return z.NEVER;
      }
    })
    .pipe(z.array(quoteBuilderOptionSchema).min(1).max(8)),
});

export async function createQuoteDraftAction(
  _previousState: ActionResult<{ quoteId: string }>,
  formData: FormData,
): Promise<ActionResult<{ quoteId: string }>> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.quote_create.auth", error);
  }
  const parsed = quoteBuilderSchema.safeParse({
    requestId: formData.get("requestId"),
    sourceQuoteId: formData.get("sourceQuoteId") ?? "",
    title: formData.get("title"),
    introduction: formData.get("introduction"),
    terms: formData.get("terms"),
    currency: formData.get("currency"),
    productionWeeks: formData.get("productionWeeks"),
    options: formData.get("options"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }
  try {
    const supabase = await createServerSupabaseClient();
    const requestResult = await supabase
      .from("design_requests")
      .select("id,status")
      .eq("id", parsed.data.requestId)
      .maybeSingle();
    if (requestResult.error) {
      throw requestResult.error;
    }
    if (
      !requestResult.data ||
      !["open", "quoted", "negotiating"].includes(requestResult.data.status)
    ) {
      return {
        ok: false,
        code: "REQUEST_NOT_QUOTABLE",
        message: "This request cannot receive a quote in its current state.",
      };
    }
    if (parsed.data.sourceQuoteId) {
      const sourceResult = await supabase
        .from("quote_versions")
        .select("id")
        .eq("id", parsed.data.sourceQuoteId)
        .eq("design_request_id", requestResult.data.id)
        .maybeSingle();
      if (sourceResult.error) {
        throw sourceResult.error;
      }
      if (!sourceResult.data) {
        return {
          ok: false,
          code: "QUOTE_SOURCE_INVALID",
          message: "The selected quote revision source is invalid.",
        };
      }
    }
    const versionResult = await supabase
      .from("quote_versions")
      .select("version_number")
      .eq("design_request_id", requestResult.data.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionResult.error) {
      throw versionResult.error;
    }
    const version = (versionResult.data?.version_number ?? 0) + 1;
    const quoteResult = await supabase
      .from("quote_versions")
      .insert({
        design_request_id: requestResult.data.id,
        version_number: version,
        title: parsed.data.title,
        introduction: parsed.data.introduction,
        terms: parsed.data.terms,
        currency: parsed.data.currency,
        production_weeks: parsed.data.productionWeeks,
        created_by: admin.id,
      })
      .select("id")
      .single();
    if (quoteResult.error) {
      throw quoteResult.error;
    }
    const options = parsed.data.options.map((option, index) => {
      const totalMinor = sumProviderSupportedMinorAmounts(
        option.lineItems.map((lineItem) => lineItem.amount),
      );
      if (totalMinor === null) {
        throw new RangeError("Validated quote option amount is unsupported.");
      }
      return {
        quote_version_id: quoteResult.data.id,
        title: option.title,
        description: option.description,
        scope_snapshot: {
          scope: option.scope,
          materials: option.materials,
          stoneAssumptions: option.stoneAssumptions,
          deliverables: option.deliverables,
        },
        included_revision_rounds: option.includedRevisionRounds,
        estimated_completion_days: option.estimatedCompletionDays,
        line_items: option.lineItems.map((lineItem) => ({
          description: lineItem.description,
          amount: {
            amountMinor: lineItem.amount,
            currency: parsed.data.currency,
          },
        })),
        currency: parsed.data.currency,
        total_minor: totalMinor,
        deposit_minor: 0,
        sort_order: index,
      };
    });
    const optionsResult = await supabase.from("quote_options").insert(options);
    if (optionsResult.error) {
      await supabase
        .from("quote_versions")
        .delete()
        .eq("id", quoteResult.data.id);
      throw optionsResult.error;
    }
    revalidatePath(`/admin/requests/${requestResult.data.id}`);
    revalidatePath("/admin/audit");
    return success(`Quote version ${version} saved as a draft.`, {
      quoteId: quoteResult.data.id,
    });
  } catch (error) {
    return actionFailure("admin.quote_create.failed", error, {
      adminId: admin.id,
      requestId: parsed.data.requestId,
    });
  }
}
