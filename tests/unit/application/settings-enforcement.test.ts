import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(
    path.resolve(
      import.meta.dirname,
      "..",
      "..",
      "..",
      ...relativePath.split("/"),
    ),
    "utf8",
  );
}

describe("published operational settings", () => {
  it("enforces published intake and quote validity without a 14-day UI default", () => {
    const customerActions = source("src/features/customer/actions.ts");
    const adminActions = source("src/features/admin/actions.ts");
    const settingsActions = source(
      "src/features/admin/site-settings-actions.ts",
    );
    const quoteDetail = source("src/components/admin/quote-detail.tsx");

    expect(customerActions).toContain("readPublishedIntakeOpen");
    expect(adminActions).toContain("readPublishedQuoteValidityDays");
    expect(settingsActions).toContain('status: "published"');
    expect(quoteDetail).not.toContain("defaultValue={14}");
    expect(quoteDetail).not.toContain('name="validityDays"');
  });

  it("publishes one typed settings singleton instead of arbitrary content slugs", () => {
    const adminActions = source("src/features/admin/site-settings-actions.ts");
    const adminData = source("src/lib/data/admin.ts");
    const settingsManager = source("src/components/admin/settings-manager.tsx");

    expect(adminActions).toContain('.from("site_settings")');
    expect(adminActions).toContain('settings_key: "public"');
    expect(adminActions).toContain('status: "published"');
    expect(adminActions).not.toContain('content_type: "setting"');
    expect(adminData).toContain('from("site_settings")');
    expect(adminData).not.toContain('from("site_content")');
    expect(settingsManager).toContain('name="brandName"');
    expect(settingsManager).toContain('name="contactEmail"');
    expect(settingsManager).toContain('name="contactPhone"');
  });
});
