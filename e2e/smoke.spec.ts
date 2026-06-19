import { test, expect } from "@playwright/test";

test("app loads and requires safety acknowledgement", async ({ page }) => {
  await page.goto("/");

  // Safety modal is mandatory on first visit.
  const safetyModal = page.locator("#safety-modal");
  await expect(safetyModal).toBeVisible();

  // Continue is disabled until the user checks the acknowledgement box.
  const continueBtn = page.locator("#safety-modal-continue");
  await expect(continueBtn).toBeDisabled();

  await page.locator("#safety-modal-ack").check();
  await expect(continueBtn).toBeEnabled();
  await continueBtn.click();

  await expect(safetyModal).toBeHidden();

  // Main app UI is now interactive.
  await expect(page.locator("#camera-wrap")).toBeVisible();
  await expect(page.locator("#history-panel")).toBeVisible();
  await expect(page.locator("#model-select")).toBeVisible();
});

test("remembers safety acknowledgement across reloads", async ({ page }) => {
  await page.goto("/");
  await page.locator("#safety-modal-ack").check();
  await page.locator("#safety-modal-continue").click();
  await expect(page.locator("#safety-modal")).toBeHidden();

  await page.reload();

  // After reload the modal should not reappear because localStorage persists.
  await expect(page.locator("#safety-modal")).toBeHidden();
  await expect(page.locator("#camera-wrap")).toBeVisible();
});
