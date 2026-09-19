import AxeBuilder from "@axe-core/playwright";
import { chromium, devices, expect, test } from "@playwright/test";

const publicRoutes = [
  { path: "/", heading: /Jewelry, composed around a life/i },
  { path: "/portfolio", heading: /Objects with an inner logic/i },
  { path: "/process", heading: /Measured, open, and deeply personal/i },
  { path: "/about", heading: /An atelier shaped by attention/i },
  { path: "/faq", heading: /Useful clarity, before we begin/i },
  { path: "/contact", heading: /A considered note is enough/i },
  { path: "/start", heading: /Begin privately, with the right context/i },
  { path: "/privacy", heading: /Privacy, described plainly/i },
  {
    path: "/terms",
    heading: /Terms for a thoughtful working relationship/i,
  },
  {
    path: "/payment-cancellation",
    heading: /Payments and changes, without hidden edges/i,
  },
] as const;

test.describe("Veyra Atelier public experience", () => {
  test("home presents the complete atelier story", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Jewelry, composed around a life/i,
      }),
    ).toBeVisible();
    await expect(page.getByText("Private by design")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Studies in memory and material." }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Clarity at every turn." }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /quotes below are clearly labeled fictional placeholders/i,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Before the first line." }),
    ).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("desktop primary navigation reaches portfolio", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.includes("mobile"),
      "Desktop navigation is hidden in the mobile project.",
    );

    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Portfolio" })
      .click();

    await expect(page).toHaveURL(/\/portfolio$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Objects with an inner logic/i,
      }),
    ).toBeVisible();
  });

  test("published portfolio cards open a canonical detail route", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name.includes("mobile"),
      "The styled mobile journey is covered by the dedicated Chromium context.",
    );

    await page.goto("/portfolio");
    const detailLink = page
      .getByRole("link", { name: "Read the study" })
      .first();
    const href = await detailLink.getAttribute("href");

    expect(href).toMatch(/^\/portfolio\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
    if (!href) throw new Error("Expected a portfolio detail href");
    await detailLink.click();

    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(
      page.getByRole("heading", { level: 2, name: "The design story" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to the archive" }),
    ).toHaveAttribute("href", "/portfolio");
  });

  test("mobile navigation works without horizontal overflow", async ({}, testInfo) => {
    test.skip(
      !testInfo.project.name.includes("mobile"),
      "Covered by the mobile project.",
    );

    const mobileBrowser = await chromium.launch();
    const iphone = devices["iPhone 13"];
    const context = await mobileBrowser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
      deviceScaleFactor: iphone.deviceScaleFactor,
      hasTouch: iphone.hasTouch,
      isMobile: iphone.isMobile,
      userAgent: iphone.userAgent,
      viewport: iphone.viewport,
    });
    const mobilePage = await context.newPage();

    try {
      await mobilePage.goto("/");
      await expect(mobilePage.locator("body")).toHaveCSS(
        "background-color",
        "rgb(246, 242, 234)",
      );
      await mobilePage.getByRole("button", { name: "Open navigation" }).click();
      await mobilePage
        .getByRole("navigation", { name: "Mobile navigation" })
        .getByRole("link", { name: "Process" })
        .click();

      await expect(mobilePage).toHaveURL(/\/process$/);
      await expect(
        mobilePage.getByRole("heading", {
          level: 1,
          name: /Measured, open, and deeply personal/i,
        }),
      ).toBeVisible();

      const overflow = await mobilePage.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    } finally {
      await mobileBrowser.close();
    }
  });

  test("every public route exposes a unique primary heading", async ({
    page,
  }) => {
    for (const route of publicRoutes) {
      await test.step(route.path, async () => {
        await page.goto(route.path);
        await expect(
          page.getByRole("heading", { level: 1, name: route.heading }),
        ).toBeVisible();
        await expect(page.locator("main#main-content")).toHaveCount(1);
      });
    }
  });

  test("start route explains the sign-in boundary", async ({ page }) => {
    await page.goto("/start");

    await expect(
      page.getByText(
        /Sign-in is required before entering or saving commission details/i,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Continue to sign in/i }),
    ).toHaveAttribute("href", "/sign-in");
  });

  test("unknown routes render the 404 experience", async ({ page }) => {
    const response = await page.goto("/a-detail-that-does-not-exist");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "A detail out of place." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Return to the atelier" }),
    ).toHaveAttribute("href", "/");
  });

  test("public pages have no obvious automated accessibility violations", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    for (const route of publicRoutes) {
      await test.step(route.path, async () => {
        await page.goto(route.path);
        await page.waitForLoadState("networkidle");

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();

        expect(
          results.violations,
          `${route.path} accessibility violations:\n${results.violations
            .map((violation) => `${violation.id}: ${violation.help}`)
            .join("\n")}`,
        ).toEqual([]);
      });
    }
  });
});
