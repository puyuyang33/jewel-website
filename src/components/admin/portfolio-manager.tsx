"use client";

import { ImagePlus, Save } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { ActionMessage } from "@/components/forms/action-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/field";
import { UploadProgress } from "@/features/uploads/upload-progress";
import { useImageUploadQueue } from "@/features/uploads/use-image-upload-queue";
import type { PortfolioProjectDto } from "@/lib/data/types";
import { initialActionResult, type ActionResult } from "@/types/actions";

type ProjectAction = (
  previousState: ActionResult<{ projectId: string }>,
  formData: FormData,
) => Promise<ActionResult<{ projectId: string }>>;
type MediaAction = (formData: FormData) => Promise<ActionResult>;

function ProjectForm({
  project,
  action,
  mediaAction,
}: {
  project?: PortfolioProjectDto;
  action: ProjectAction;
  mediaAction?: MediaAction;
}) {
  const [state, formAction] = useActionState(action, {
    ...initialActionResult,
  } as ActionResult<{ projectId: string }>);
  return (
    <>
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="projectId" value={project?.id ?? ""} />
        <ActionMessage
          result={state.ok ? { ok: true, message: state.message } : state}
        />
        <div className="grid gap-2">
          <Label htmlFor={`project-title-${project?.id ?? "new"}`}>Title</Label>
          <Input
            id={`project-title-${project?.id ?? "new"}`}
            name="title"
            defaultValue={project?.title ?? ""}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`project-slug-${project?.id ?? "new"}`}>Slug</Label>
          <Input
            id={`project-slug-${project?.id ?? "new"}`}
            name="slug"
            defaultValue={project?.slug ?? ""}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`project-excerpt-${project?.id ?? "new"}`}>
            Excerpt
          </Label>
          <Textarea
            id={`project-excerpt-${project?.id ?? "new"}`}
            name="excerpt"
            defaultValue={project?.excerpt ?? ""}
            required
            maxLength={500}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`project-story-${project?.id ?? "new"}`}>Story</Label>
          <Textarea
            id={`project-story-${project?.id ?? "new"}`}
            name="story"
            defaultValue={project?.story ?? ""}
            required
            maxLength={12_000}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`materials-${project?.id ?? "new"}`}>
              Materials, comma-separated
            </Label>
            <Input
              id={`materials-${project?.id ?? "new"}`}
              name="materials"
              defaultValue={project?.materials.join(", ") ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`techniques-${project?.id ?? "new"}`}>
              Techniques, comma-separated
            </Label>
            <Input
              id={`techniques-${project?.id ?? "new"}`}
              name="techniques"
              defaultValue={project?.techniques.join(", ") ?? ""}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor={`status-${project?.id ?? "new"}`}>Status</Label>
            <select
              id={`status-${project?.id ?? "new"}`}
              name="status"
              defaultValue={project?.status ?? "draft"}
              className="border-ink/15 min-h-12 rounded-xl border bg-white px-4"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`sort-${project?.id ?? "new"}`}>Sort order</Label>
            <Input
              id={`sort-${project?.id ?? "new"}`}
              name="sortOrder"
              type="number"
              defaultValue={project?.sortOrder ?? 0}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`completed-${project?.id ?? "new"}`}>
              Completed on
            </Label>
            <Input
              id={`completed-${project?.id ?? "new"}`}
              name="completedOn"
              type="date"
              defaultValue={project?.completedOn ?? ""}
            />
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="featured"
            defaultChecked={project?.featured ?? false}
            className="accent-garnet size-4"
          />
          Featured project
        </label>
        <SubmitButton
          pendingLabel="Saving project…"
          disabled={!project && state.ok && Boolean(state.data)}
        >
          <Save aria-hidden="true" size={16} />
          {!project && state.ok && state.data
            ? "Project saved"
            : "Save project"}
        </SubmitButton>
      </form>
      {!project && state.ok && state.data && mediaAction ? (
        <MediaForm projectId={state.data.projectId} action={mediaAction} />
      ) : null}
    </>
  );
}

function MediaForm({
  projectId,
  action,
}: {
  projectId: string;
  action: MediaAction;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionResult>(initialActionResult);
  const [pending, setPending] = useState(false);
  const uploads = useImageUploadQueue({ purpose: "portfolio", maximum: 1 });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || uploads.validationError || uploads.queue.length !== 1) {
      setState({
        ok: false,
        code: "VALIDATION_ERROR",
        message:
          uploads.validationError ?? "Choose one portfolio image to upload.",
      });
      return;
    }
    setPending(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const uploadIds = await uploads.uploadAll(
        projectId,
        String(formData.get("altText") ?? ""),
      );
      const uploadId = uploadIds[0];
      if (!uploadId) {
        throw new Error("The portfolio upload did not return an identifier.");
      }
      const finalizeData = new FormData();
      finalizeData.set("projectId", projectId);
      finalizeData.set("uploadId", uploadId);
      const result = await action(finalizeData);
      setState(result);
      if (result.ok) {
        uploads.reset();
        form.reset();
        router.refresh();
      }
    } catch (error) {
      setState({
        ok: false,
        code: "UPLOAD_FAILED",
        message:
          error instanceof Error
            ? `${error.message} Retry with the same selected image.`
            : "The image upload failed. Retry with the same image.",
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={handleSubmit}
      className="border-ink/10 mt-5 grid gap-3 border-t pt-5"
    >
      <ActionMessage result={state} />
      <div className="grid gap-2">
        <Label htmlFor={`media-file-${projectId}`}>Portfolio image</Label>
        <Input
          id={`media-file-${projectId}`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          disabled={uploads.completedCount > 0}
          onChange={(event) => uploads.selectFiles(event.target.files)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`media-alt-${projectId}`}>Alt text</Label>
        <Input id={`media-alt-${projectId}`} name="altText" required />
      </div>
      <div>
        <UploadProgress
          queue={uploads.queue}
          validationError={uploads.validationError}
        />
      </div>
      <Button
        type="submit"
        variant="secondary"
        disabled={pending || Boolean(uploads.validationError)}
      >
        <ImagePlus aria-hidden="true" size={16} />
        {pending
          ? "Uploading portfolio image…"
          : uploads.hasFailures
            ? "Retry portfolio upload"
            : "Upload and verify image"}
      </Button>
    </form>
  );
}

export function PortfolioManager({
  projects,
  projectAction,
  mediaAction,
}: {
  projects: PortfolioProjectDto[];
  projectAction: ProjectAction;
  mediaAction: MediaAction;
}) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <p className="eyebrow">New public story</p>
        <h2 className="font-display mt-2 text-4xl">Create portfolio project</h2>
        <div className="mt-6">
          <ProjectForm action={projectAction} mediaAction={mediaAction} />
        </div>
      </Card>
      <section className="grid gap-5 lg:grid-cols-2">
        {projects.map((project) => (
          <Card key={project.id} className="p-6">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
              <h2 className="font-display text-3xl">{project.title}</h2>
              <Badge>{project.status}</Badge>
            </div>
            {project.media.length > 0 ? (
              <ul className="mt-4 grid gap-2">
                {project.media.map((media) => (
                  <li key={media.id}>
                    {project.status === "published" && project.publishedAt ? (
                      <Link
                        href={`/api/portfolio-media/${media.id}/open`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border-ink/10 hover:border-garnet/35 hover:text-garnet block rounded-xl border bg-white px-4 py-3 text-sm font-semibold"
                      >
                        {media.altText}
                      </Link>
                    ) : (
                      <div className="border-ink/10 bg-parchment/35 rounded-xl border px-4 py-3 text-sm">
                        <p className="font-semibold">{media.altText}</p>
                        <p className="text-stone mt-1 text-xs">
                          Preview becomes available after the project is
                          published.
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-stone mt-4 text-sm">No media uploaded.</p>
            )}
            <details className="mt-5">
              <summary className="text-garnet cursor-pointer font-semibold">
                Edit project and media
              </summary>
              <div className="mt-5">
                <ProjectForm project={project} action={projectAction} />
                <MediaForm projectId={project.id} action={mediaAction} />
              </div>
            </details>
          </Card>
        ))}
      </section>
    </div>
  );
}
