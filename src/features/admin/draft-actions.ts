"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  actionFailure,
  optionalText,
  success,
  uuidSchema,
  validationFailure,
} from "@/features/application/action-utils";
import { requireAdmin } from "@/lib/auth/dal";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";

const draftCreateSchema = z.object({
  commissionId: uuidSchema,
  draftId: z.union([uuidSchema, z.literal("")]),
  newDraftId: uuidSchema,
  stage: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,49}$/),
  title: z.string().trim().min(1).max(200),
  notes: optionalText(5_000),
  idempotencyKey: uuidSchema,
});

export async function createDraftRevisionAction(
  formData: FormData,
): Promise<ActionResult<{ revisionId: string }>> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return actionFailure("admin.draft_create.auth", error);
  }
  const parsed = draftCreateSchema.safeParse({
    commissionId: formData.get("commissionId"),
    draftId: formData.get("draftId") ?? "",
    newDraftId: formData.get("newDraftId"),
    stage: formData.get("stage"),
    title: formData.get("title"),
    notes: formData.get("notes"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    const supabase = await createServerSupabaseClient();
    let draftId = parsed.data.draftId;
    let createdDraftId: string | null = null;
    if (!draftId) {
      const existingDraftResult = await supabase
        .from("design_drafts")
        .select("id")
        .eq("id", parsed.data.newDraftId)
        .eq("commission_id", parsed.data.commissionId)
        .maybeSingle();
      if (existingDraftResult.error) {
        throw existingDraftResult.error;
      }
      draftId = existingDraftResult.data?.id ?? "";
    }
    if (!draftId) {
      const commissionResult = await supabase
        .from("commissions")
        .select("id,status")
        .eq("id", parsed.data.commissionId)
        .maybeSingle();
      if (commissionResult.error) {
        throw commissionResult.error;
      }
      if (
        !commissionResult.data ||
        !["in_progress", "revision_requested"].includes(
          commissionResult.data.status,
        )
      ) {
        return {
          ok: false,
          code: "DRAFT_NOT_AVAILABLE",
          message: "Drafts can only be prepared during active design work.",
        };
      }
      const sequenceResult = await supabase
        .from("design_drafts")
        .select("sequence_number")
        .eq("commission_id", commissionResult.data.id)
        .order("sequence_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sequenceResult.error) {
        throw sequenceResult.error;
      }
      const draftResult = await supabase
        .from("design_drafts")
        .insert({
          id: parsed.data.newDraftId,
          commission_id: commissionResult.data.id,
          sequence_number: (sequenceResult.data?.sequence_number ?? 0) + 1,
          stage: parsed.data.stage,
          title: parsed.data.title,
          status: "working",
          created_by: admin.id,
        })
        .select("id")
        .single();
      if (draftResult.error) {
        if (draftResult.error.code === "23505") {
          const replayDraftResult = await supabase
            .from("design_drafts")
            .select("id")
            .eq("id", parsed.data.newDraftId)
            .eq("commission_id", commissionResult.data.id)
            .maybeSingle();
          if (replayDraftResult.error) {
            throw replayDraftResult.error;
          }
          if (!replayDraftResult.data) {
            return {
              ok: false,
              code: "DRAFT_REVISION_STALE",
              message:
                "The draft series changed while you were working. Refresh and try again.",
            };
          }
          draftId = replayDraftResult.data.id;
        } else {
          throw draftResult.error;
        }
      } else {
        draftId = draftResult.data.id;
        createdDraftId = draftId;
      }
    }

    const revisionResult = await supabase.rpc("create_draft_revision", {
      p_commission_id: parsed.data.commissionId,
      p_design_draft_id: draftId,
      p_title: parsed.data.title,
      p_notes: parsed.data.notes,
      p_idempotency_key: parsed.data.idempotencyKey,
    });
    if (revisionResult.error) {
      if (createdDraftId) {
        const cleanupResult = await supabase
          .from("design_drafts")
          .delete()
          .eq("id", createdDraftId);
        if (cleanupResult.error) {
          throw cleanupResult.error;
        }
      }
      if (revisionResult.error.code === "22023") {
        return {
          ok: false,
          code: "DRAFT_REVISION_CONFLICT",
          message:
            "This revision no longer matches its original submission. Refresh and try again.",
        };
      }
      if (["55000", "P0002", "23505"].includes(revisionResult.error.code)) {
        return {
          ok: false,
          code: "DRAFT_REVISION_STALE",
          message:
            "The draft series changed while you were working. Refresh and try again.",
        };
      }
      throw revisionResult.error;
    }
    const revision = revisionResult.data[0];
    if (!revision) {
      throw new Error("Draft revision creation returned no result.");
    }

    revalidatePath(`/admin/commissions/${parsed.data.commissionId}`);
    revalidatePath("/admin/audit");
    return success(
      revision.created
        ? "Draft revision saved privately."
        : "Draft revision was already saved.",
      { revisionId: revision.draft_revision_id },
    );
  } catch (error) {
    return actionFailure("admin.draft_create.failed", error, {
      adminId: admin.id,
      commissionId: parsed.data.commissionId,
    });
  }
}
