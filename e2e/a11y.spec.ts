import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

// Gap #12 — accessibility CI gate. Asserts the main app UI has no WCAG 2.1
// A/AA violations detected by axe-core. Runs in the existing Playwright suite
// (chromium + firefox in e2e:ci, webkit on CI). A real violation fails CI;
// fix the markup, do not widen the disableRules list without a reason.

test("main app UI has no WCAG 2.1 AA axe violations", async ({ page }) => {
  await page.goto("/");
  await page.locator("#safety-modal-ack").check();
  await page.locator("#safety-modal-continue").click();
  await expect(page.locator("#camera-wrap")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const summary = results.violations
    .map((v) => `${v.id} (${v.impact}): ${v.description}`)
    .join("\n");
  expect(results.violations, summary).toEqual([]);
});