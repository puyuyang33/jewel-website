import "server-only";

import { z } from "zod";

import { limits } from "@/config/limits";
import { requireSupabaseConfiguration } from "@/lib/supabase/config";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { VeyraSupabaseClient } from "@/lib/supabase/types";

import {
  ProtocolError,
  safeProtocolErrorResponse,
} from "../../../uploads/_lib/protocol";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const entityIdSchema = z.uuid();

export interface PublishedPortfolioMediaRecord {
  readonly id: string;
  readonly bucket: string;
  readonly objectPath: string;
  readonly mediaType: string;
  readonly projectStatus: "draft" | "published" | "archived";
  readonly projectPublishedAt: string | null;
}

export interface PortfolioMediaRepository {
  findById(id: string): Promise<PublishedPortfolioMediaRecord | null>;
  createSignedUrl(record: PublishedPortfolioMediaRecord): Promise<string>;
}

export interface PortfolioMediaRouteDependencies {
  readonly createRepository: () => Promise<PortfolioMediaRepository>;
  readonly storageOrigin: () => string;
}

function requireData<T>(result: {
  data: T;
  error: unknown;
}): NonNullable<T> | null {
  if (result.error) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  return result.data as NonNullable<T> | null;
}

function isSafePortfolioObject(record: PublishedPortfolioMediaRecord): boolean {
  return (
    record.projectStatus === "published" &&
    record.projectPublishedAt !== null &&
    record.mediaType === "image" &&
    record.bucket === "portfolio-public" &&
    record.objectPath.length > 0 &&
    record.objectPath.length <= 1_024 &&
    !record.objectPath.startsWith("/") &&
    !record.objectPath.includes("\\") &&
    !record.objectPath.includes("://") &&
    !/(^|\/)\.\.?($|\/)/u.test(record.objectPath) &&
    !/[\u0000-\u001f\u007f]/u.test(record.objectPath)
  );
}

function requireTrustedSignedUrl(
  value: string,
  storageOriginValue: string,
): string {
  if (value.length < 1 || value.length > 8_192) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }

  let expected: URL;
  let candidate: URL;
  try {
    expected = new URL(storageOriginValue);
    candidate = new URL(value, expected);
  } catch {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  if (
    candidate.origin !== expected.origin ||
    candidate.username ||
    candidate.password ||
    !candidate.pathname.startsWith("/storage/v1/object/sign/portfolio-public/")
  ) {
    throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
  }
  return candidate.toString();
}

export function createSupabasePortfolioMediaRepository(
  metadataClient: VeyraSupabaseClient,
  serviceClient: VeyraSupabaseClient,
): PortfolioMediaRepository {
  return {
    async findById(id) {
      const media = requireData(
        await metadataClient
          .from("portfolio_media")
          .select(
            "id, portfolio_project_id, bucket_id, object_path, media_type",
          )
          .eq("id", id)
          .maybeSingle(),
      );
      if (!media) {
        return null;
      }
      const project = requireData(
        await metadataClient
          .from("portfolio_projects")
          .select("status, published_at")
          .eq("id", media.portfolio_project_id)
          .maybeSingle(),
      );
      if (!project) {
        return null;
      }
      return {
        id: media.id,
        bucket: media.bucket_id,
        objectPath: media.object_path,
        mediaType: media.media_type,
        projectStatus: project.status,
        projectPublishedAt: project.published_at,
      };
    },

    async createSignedUrl(record) {
      const { data, error } = await serviceClient.storage
        .from(record.bucket)
        .createSignedUrl(record.objectPath, limits.signedUrlLifetimeSeconds);
      if (error || !data?.signedUrl) {
        throw new ProtocolError("DEPENDENCY_UNAVAILABLE");
      }
      return data.signedUrl;
    },
  };
}

const defaultDependencies: PortfolioMediaRouteDependencies = {
  async createRepository() {
    return createSupabasePortfolioMediaRepository(
      await createServerSupabaseClient(),
      createServiceRoleClient(),
    );
  },
  storageOrigin() {
    return requireSupabaseConfiguration().url;
  },
};

export function createPortfolioMediaOpenHandler(
  dependencies: Partial<PortfolioMediaRouteDependencies> = {},
): (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response> {
  const deps = { ...defaultDependencies, ...dependencies };

  return async function portfolioMediaOpenHandler(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    try {
      const id = entityIdSchema.safeParse((await context.params).id);
      if (!id.success) {
        throw new ProtocolError("NOT_FOUND");
      }
      const repository = await deps.createRepository();
      const record = await repository.findById(id.data);
      if (!record || !isSafePortfolioObject(record)) {
        throw new ProtocolError("NOT_FOUND");
      }

      const signedUrl = requireTrustedSignedUrl(
        await repository.createSignedUrl(record),
        deps.storageOrigin(),
      );
      return new Response(null, {
        status: 303,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Location: signedUrl,
          Pragma: "no-cache",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      const response = safeProtocolErrorResponse(error);
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    }
  };
}

export const GET = createPortfolioMediaOpenHandler();
