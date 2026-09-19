import { describe, expect, it } from "vitest";

import { limits } from "@/config/limits";
import {
  assertAdminEmail,
  isAdminEmail,
  normalizeEmail,
} from "@/lib/domain/admin";
import {
  maximumFilesForContext,
  uploadFileMetadataSchema,
  validateUploadFiles,
} from "@/lib/domain/files";
import {
  isExternalHostAllowed,
  isSafeInternalRedirect,
  normalizeAllowedExternalHosts,
  parseExternalHttpsUrl,
  safeInternalRedirect,
} from "@/lib/domain/urls";

describe("external deliverable URLs", () => {
  const hosts = ["dropbox.com", "*.files.example.com"];

  it("accepts canonical HTTPS URLs on exact and wildcard hosts", () => {
    expect(
      parseExternalHttpsUrl("https://DROPBOX.com/shared/final.pdf?dl=1", hosts),
    ).toBe("https://dropbox.com/shared/final.pdf?dl=1");
    expect(
      parseExternalHttpsUrl(
        "https://customer.files.example.com/final.zip",
        hosts,
      ),
    ).toBe("https://customer.files.example.com/final.zip");
    expect(isExternalHostAllowed("dropbox.com", hosts)).toBe(true);
    expect(isExternalHostAllowed("customer.files.example.com", hosts)).toBe(
      true,
    );
  });

  it("uses exact label boundaries and does not let wildcards match the apex", () => {
    expect(isExternalHostAllowed("evildropbox.com", hosts)).toBe(false);
    expect(isExternalHostAllowed("files.example.com", hosts)).toBe(false);
    expect(isExternalHostAllowed("badfiles.example.com", hosts)).toBe(false);
  });

  it.each([
    "http://dropbox.com/file",
    "https://user:secret@dropbox.com/file",
    "https://dropbox.com:8443/file",
    "https://dropbox.com./file",
    "https://evil.example/file",
  ])("rejects unsafe or unapproved external URL %s", (url) => {
    expect(() => parseExternalHttpsUrl(url, hosts)).toThrow();
  });

  it("normalizes and deduplicates valid allowlist entries", () => {
    expect(
      normalizeAllowedExternalHosts([
        " Dropbox.com ",
        "dropbox.com",
        "*.FILES.example.com",
      ]),
    ).toEqual(["dropbox.com", "*.files.example.com"]);
    expect(() => normalizeAllowedExternalHosts(["*.com"])).toThrow();
    expect(() => normalizeAllowedExternalHosts(["dropbox.com."])).toThrow();
  });
});

describe("internal redirects", () => {
  it("accepts and normalizes same-origin absolute paths", () => {
    expect(safeInternalRedirect("/commissions/123?tab=messages#latest")).toBe(
      "/commissions/123?tab=messages#latest",
    );
    expect(isSafeInternalRedirect("/account")).toBe(true);
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/%5Cevil.example",
    " /account",
    "/account\nheader:value",
    "/bad%zz",
    "",
  ])("rejects unsafe redirect %j", (redirect) => {
    expect(isSafeInternalRedirect(redirect)).toBe(false);
    expect(safeInternalRedirect(redirect, "/dashboard")).toBe("/dashboard");
  });

  it("requires the fallback itself to be safe", () => {
    expect(() =>
      safeInternalRedirect("https://evil.example", "//also-evil.example"),
    ).toThrow(/fallback/u);
  });
});

describe("image file validation", () => {
  const jpeg = {
    name: "reference.JPEG",
    sizeBytes: 1_024,
    mimeType: " IMAGE/JPEG ",
  };

  it("normalizes supported MIME types and enforces context limits", () => {
    expect(uploadFileMetadataSchema.parse(jpeg)).toEqual({
      ...jpeg,
      mimeType: "image/jpeg",
    });
    expect(maximumFilesForContext("message")).toBe(4);
    expect(maximumFilesForContext("design_request")).toBe(10);

    const files = validateUploadFiles([jpeg], "message");
    expect(files).toEqual([
      { name: "reference.JPEG", sizeBytes: 1_024, mimeType: "image/jpeg" },
    ]);
    expect(Object.isFrozen(files)).toBe(true);
    expect(Object.isFrozen(files[0])).toBe(true);
  });

  it("accepts the exact byte boundary", () => {
    expect(
      uploadFileMetadataSchema.safeParse({
        name: "render.webp",
        sizeBytes: limits.imageBytes,
        mimeType: "image/webp",
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ ...jpeg, sizeBytes: 0 }, "empty files"],
    [{ ...jpeg, sizeBytes: limits.imageBytes + 1 }, "oversized files"],
    [{ ...jpeg, mimeType: "image/gif" }, "unsupported MIME types"],
    [{ ...jpeg, name: "reference.png" }, "extension spoofing"],
    [{ ...jpeg, name: "../reference.jpeg" }, "path-like names"],
  ])("rejects %s (%s)", (file) => {
    expect(uploadFileMetadataSchema.safeParse(file).success).toBe(false);
  });

  it("enforces per-message counts and nonempty batches", () => {
    expect(() => validateUploadFiles([], "message")).toThrow();
    expect(() =>
      validateUploadFiles(
        Array.from({ length: 5 }, (_, index) => ({
          name: `reference-${index}.png`,
          sizeBytes: 10,
          mimeType: "image/png",
        })),
        "message",
      ),
    ).toThrow();
  });
});

describe("admin email normalization", () => {
  it("normalizes whitespace and case before comparison", () => {
    expect(normalizeEmail("  Designer@Example.COM ")).toBe(
      "designer@example.com",
    );
    expect(isAdminEmail(" DESIGNER@example.com ", "designer@EXAMPLE.com")).toBe(
      true,
    );
    expect(() =>
      assertAdminEmail("designer@example.com", "DESIGNER@example.com"),
    ).not.toThrow();
  });

  it("rejects invalid and nonmatching identities", () => {
    expect(isAdminEmail("not-an-email", "designer@example.com")).toBe(false);
    expect(isAdminEmail("Ｄesigner@example.com", "designer@example.com")).toBe(
      false,
    );
    expect(isAdminEmail("other@example.com", "designer@example.com")).toBe(
      false,
    );
    expect(() =>
      assertAdminEmail("other@example.com", "designer@example.com"),
    ).toThrow(/does not match/u);
    expect(() => isAdminEmail("designer@example.com", "bad config")).toThrow();
  });
});
