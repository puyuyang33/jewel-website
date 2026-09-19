import { CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";

import type { QueuedImage } from "./use-image-upload-queue";

export function UploadProgress({
  queue,
  validationError,
}: {
  queue: QueuedImage[];
  validationError: string | null;
}) {
  if (validationError) {
    return (
      <p
        className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        role="alert"
      >
        {validationError}
      </p>
    );
  }
  if (queue.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-2" aria-label="Image upload progress">
      {queue.map((item) => (
        <li
          key={item.key}
          className="border-ink/10 rounded-xl border bg-white px-4 py-3"
        >
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold">
              {item.file.name}
            </span>
            <span className="text-stone flex shrink-0 items-center gap-1 text-xs">
              {item.status === "complete" ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="text-emerald-700"
                  size={15}
                />
              ) : item.status === "failed" ? (
                <TriangleAlert
                  aria-hidden="true"
                  className="text-red-700"
                  size={15}
                />
              ) : item.status === "uploading" ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  size={15}
                />
              ) : null}
              {item.status === "uploading" ? `${item.progress}%` : item.status}
            </span>
          </div>
          <progress
            className="accent-garnet mt-2 h-1.5 w-full"
            max={100}
            value={item.progress}
          >
            {item.progress}%
          </progress>
          {item.error ? (
            <p className="mt-2 text-xs text-red-700" role="alert">
              {item.error}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
