"use client";

import { useCallback, useRef, useState } from "react";

import { limits } from "@/config/limits";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ImageUploadPurpose = "request" | "message" | "draft" | "portfolio";

export interface QueuedImage {
  key: string;
  file: File;
  clientId: string;
  uploadId: string | null;
  progress: number;
  status: "ready" | "uploading" | "complete" | "failed";
  error: string | null;
}

export interface UploadResponse {
  upload: {
    id: string;
    purpose: ImageUploadPurpose;
    mimeType?: string;
    byteSize?: number;
    width?: number;
    height?: number;
    reused?: boolean;
  };
}

export function validateQueuedImages(
  files: readonly File[],
  maximum: number,
): string | null {
  if (files.length > maximum) {
    return `Choose no more than ${maximum} image${maximum === 1 ? "" : "s"}.`;
  }
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return `${file.name} is not a JPEG, PNG, or WebP image.`;
    }
    if (file.size < 1) {
      return `${file.name} is empty.`;
    }
    if (file.size > limits.imageBytes) {
      return `${file.name} exceeds the ${limits.imageMegabytes} MB image limit.`;
    }
  }
  return null;
}

function parseUploadResponse(xhr: XMLHttpRequest): UploadResponse {
  let payload: unknown;
  try {
    payload = JSON.parse(xhr.responseText) as unknown;
  } catch {
    throw new Error("The upload service returned an invalid response.");
  }
  if (
    xhr.status < 200 ||
    xhr.status >= 300 ||
    typeof payload !== "object" ||
    payload === null ||
    !("upload" in payload) ||
    typeof payload.upload !== "object" ||
    payload.upload === null ||
    !("id" in payload.upload) ||
    typeof payload.upload.id !== "string"
  ) {
    const errorMessage =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : "The image could not be uploaded.";
    throw new Error(errorMessage);
  }
  return payload as UploadResponse;
}

export type UploadTransport = (
  formData: FormData,
  onProgress: (progress: number) => void,
) => Promise<UploadResponse>;

function uploadMultipart(
  formData: FormData,
  onProgress: (progress: number) => void,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.responseType = "text";
    xhr.withCredentials = true;
    xhr.timeout = 120_000;
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(
          Math.min(99, Math.round((event.loaded / event.total) * 100)),
        );
      }
    });
    xhr.addEventListener("load", () => {
      try {
        onProgress(100);
        resolve(parseUploadResponse(xhr));
      } catch (error) {
        reject(error);
      }
    });
    xhr.addEventListener("error", () => {
      reject(new Error("The upload connection failed."));
    });
    xhr.addEventListener("abort", () => {
      reject(new Error("The upload was cancelled."));
    });
    xhr.addEventListener("timeout", () => {
      reject(new Error("The upload timed out."));
    });
    xhr.send(formData);
  });
}

export function useImageUploadQueue({
  purpose,
  maximum,
  transport = uploadMultipart,
}: {
  purpose: ImageUploadPurpose;
  maximum: number;
  transport?: UploadTransport;
}) {
  const queueRef = useRef<QueuedImage[]>([]);
  const [queue, setQueue] = useState<QueuedImage[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const sync = useCallback((next: QueuedImage[]) => {
    queueRef.current = next;
    setQueue([...next]);
  }, []);

  const selectFiles = useCallback(
    (fileList: FileList | null) => {
      const files = fileList ? Array.from(fileList) : [];
      const error = validateQueuedImages(files, maximum);
      setValidationError(error);
      if (error) {
        sync([]);
        return;
      }
      sync(
        files.map((file, index) => ({
          key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
          file,
          clientId: crypto.randomUUID(),
          uploadId: null,
          progress: 0,
          status: "ready",
          error: null,
        })),
      );
    },
    [maximum, sync],
  );

  const uploadAll = useCallback(
    async (targetId: string, altText?: string): Promise<string[]> => {
      setValidationError(null);
      for (let index = 0; index < queueRef.current.length; index += 1) {
        const current = queueRef.current[index];
        if (!current || current.uploadId) {
          continue;
        }
        const uploading = queueRef.current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                status: "uploading" as const,
                error: null,
              }
            : item,
        );
        sync(uploading);
        const formData = new FormData();
        formData.set("purpose", purpose);
        formData.set("targetId", targetId);
        formData.set("clientId", current.clientId);
        if (purpose === "portfolio") {
          formData.set("altText", altText ?? "");
        }
        formData.set("file", current.file);
        try {
          const response = await transport(formData, (progress) => {
            sync(
              queueRef.current.map((item, itemIndex) =>
                itemIndex === index ? { ...item, progress } : item,
              ),
            );
          });
          sync(
            queueRef.current.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    uploadId: response.upload.id,
                    progress: 100,
                    status: "complete" as const,
                    error: null,
                  }
                : item,
            ),
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "The image could not be uploaded.";
          sync(
            queueRef.current.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    status: "failed" as const,
                    error: message,
                  }
                : item,
            ),
          );
          throw new Error(message);
        }
      }
      return queueRef.current.flatMap((item) =>
        item.uploadId ? [item.uploadId] : [],
      );
    },
    [purpose, sync, transport],
  );

  const reset = useCallback(() => {
    setValidationError(null);
    sync([]);
  }, [sync]);

  return {
    queue,
    validationError,
    selectFiles,
    uploadAll,
    reset,
    completedCount: queue.filter((item) => item.status === "complete").length,
    hasFailures: queue.some((item) => item.status === "failed"),
  };
}
