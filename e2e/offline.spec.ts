import { test, expect, type Page } from "@playwright/test";

// Offline-first guarantees: the app shell must render from the Service Worker
// cache with no network, and the offline.html fallback resource must be precached
// so the SW has something to serve when the shell cache is empty.

// The SW registers during app init (after the mandatory safety ack) and uses
// skipWaiting + clients.claim, so it controls the page once active. Wait for that
// before asserting anything offline.
async function waitForServiceWorkerActive(page: Page): Promise<void> {
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    { timeout: 10_000 },
  );
}

async function acknowledgeSafety(page: Page): Promise<void> {
  await page.locator("#safety-modal-ack").check();
  await page.locator("#safety-modal-continue").click();
  await expect(page.locator("#safety-modal")).toBeHidden();
  await waitForServiceWorkerActive(page);
}

test("app shell renders from cache while offline", async ({
  page,
  context,
  browserName,
}) => {
  // ponytail: Playwright WebKit does not emulate context.setOffline reliably —
  // page.reload() while offline throws "WebKit encountered an internal error".
  // This is a browser-driver limitation, not a ForagerFlow SW defect. Offline
  // shell serving is still verified on chromium + firefox below; the precache
  // test runs on all three.
  test.skip(
    browserName === "webkit",
    "WebKit setOffline emulation unsupported (Playwright known limitation)",
  );
  await page.goto("/");
  await acknowledgeSafety(page);
  await expect(page.locator("#camera-wrap")).toBeVisible();

  // Cut the network and reload: the SW must serve the cached shell.
  await context.setOffline(true);
  await page.reload();

  // Safety acknowledgement persists in localStorage, so the modal stays gone
  // and the main UI renders entirely from cache.
  await expect(page.locator("#safety-modal")).toBeHidden();
  await expect(page.locator("#camera-wrap")).toBeVisible();
  await expect(page.locator("#history-panel")).toBeVisible();
});

test("offline.html fallback resource is precached on install", async ({
  page,
}) => {
  await page.goto("/");
  await acknowledgeSafety(page);

  // The install event precaches /offline.html; confirm it is retrievable.
  await expect
    .poll(async () => {
      return await page.evaluate(async () => {
        const res = await caches.match("/offline.html");
        return res !== undefined;
      });
    })
    .toBe(true);
});