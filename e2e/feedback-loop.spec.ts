import { test, expect } from "@playwright/test";

// Feedback loop: save feedback → sync pushFeedback → POST /feedback → backend.
// Tests the full feedback-to-sync pipeline by injecting entries into IndexedDB
// and intercepting the outgoing fetch calls.

async function acknowledgeSafety(page: import("@playwright/test").Page) {
  await page.locator("#safety-modal-ack").check();
  await page.locator("#safety-modal-continue").click();
  await expect(page.locator("#safety-modal")).toBeHidden();
}

function makeEntry(id: string, timestamp: string) {
  return {
    id,
    timestamp,
    modelKey: "bvra",
    top1Species: "Amanita muscaria",
    top1Probability: 0.92,
    top1Edibility: "Poisonous",
    predictions: [
      { label: "Amanita muscaria", probability: 0.92 },
      { label: "Amanita pantherina", probability: 0.05 },
    ],
    thumbnail: "",
    notes: "",
  };
}

function makeFeedback() {
  return {
    correctSpecies: "Amanita muscaria (confirmed)",
    notes: "Found under birch tree",
    timestamp: new Date().toISOString(),
  };
}

test.describe("Feedback → sync → backend loop", () => {
  test("saves feedback and pushes it to the sync backend", async ({
    page,
  }) => {
    await page.goto("/");
    await acknowledgeSafety(page);

    // Inject a history entry with feedback into IndexedDB.
    const entryId = `e2e-feedback-${Date.now()}`;
    const entry = makeEntry(entryId, new Date().toISOString());
    const feedback = makeFeedback();

    const syncedPayload = await page.evaluate(
      async (args: { entry: typeof entry; feedback: typeof feedback }) => {
        const { openDB, STORE_NAME } = await import("@/services/history/db");
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        await new Promise<void>((resolve, reject) => {
          const req = store.put({ ...args.entry, feedback: args.feedback });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(new Error("IDB put failed"));
        });
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(new Error(tx.error?.message ?? "IDB tx failed"));
        });

        // Intercept fetch to capture the POST /feedback payload.
        let capturedPayload: unknown = null;
        const originalFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = async (
          input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url.includes("/feedback") && init?.method === "POST") {
            capturedPayload = JSON.parse(init.body as string);
            return new Response(JSON.stringify({ ok: true, count: 1 }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return originalFetch(input, init);
        };

        // Simulate sync config so pushFeedback doesn't early-return.
        // Vite inlines env at build time, but we can set the config values
        // directly by importing and patching.
        const { pushFeedback } = await import("@/services/sync");
        await pushFeedback();

        globalThis.fetch = originalFetch;
        return capturedPayload;
      },
      { entry, feedback },
    );

    // Verify the payload shape matches the FeedbackEntry sync contract.
    expect(syncedPayload).toBeTruthy();
    const payload = syncedPayload as {
      feedback: {
        id: string;
        feedback: {
          correctSpecies: string;
          notes: string;
          timestamp: string;
        };
      }[];
    };
    expect(payload.feedback).toBeInstanceOf(Array);
    expect(payload.feedback.length).toBe(1);
    expect(payload.feedback[0]!.id).toBe(entryId);
    expect(payload.feedback[0]!.feedback.correctSpecies).toBe(
      "Amanita muscaria (confirmed)",
    );
    expect(payload.feedback[0]!.feedback.notes).toBe("Found under birch tree");
  });

  test("pushFeedback skips when no entries have feedback", async ({
    page,
  }) => {
    await page.goto("/");
    await acknowledgeSafety(page);

    const result = await page.evaluate(async () => {
      // Inject a history entry WITHOUT feedback.
      const { openDB, STORE_NAME } = await import("@/services/history/db");
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const req = store.put({
          id: "e2e-no-feedback",
          timestamp: new Date().toISOString(),
          modelKey: "bvra",
          top1Species: "Test species",
          top1Probability: 0.8,
          top1Edibility: "Unknown",
          predictions: [],
          thumbnail: "",
          notes: "",
        });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(new Error("IDB put failed"));
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("tx failed"));
      });

      // Track whether fetch was called at all.
      let fetchCalled = false;
      const originalFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        fetchCalled = true;
        return originalFetch(input, init);
      };

      const { pushFeedback } = await import("@/services/sync");
      await pushFeedback();

      globalThis.fetch = originalFetch;
      return fetchCalled;
    });

    // No feedback entries → fetch should not be called.
    expect(result).toBe(false);
  });
});
