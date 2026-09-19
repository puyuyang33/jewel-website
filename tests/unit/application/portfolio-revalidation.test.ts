import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("portfolio media cache invalidation", () => {
  it("uses the authorized project slug and invalidates every public surface", () => {
    const source = readFileSync(
      path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "src",
        "features",
        "admin",
        "actions.ts",
      ),
      "utf8",
    );
    const finalizeAction = source.match(
      /export async function finalizePortfolioUploadAction[\s\S]*$/,
    )?.[0];

    expect(finalizeAction).toBeDefined();
    expect(finalizeAction).toContain('.select("id,slug")');
    expect(finalizeAction).toContain('revalidatePath("/")');
    expect(finalizeAction).toContain('revalidatePath("/portfolio")');
    expect(finalizeAction).toContain(
      "revalidatePath(`/portfolio/${projectResult.data.slug}`)",
    );
    expect(finalizeAction).not.toContain('formData.get("slug")');
  });
});
