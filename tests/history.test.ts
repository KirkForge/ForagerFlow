import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  saveIdentification,
  getHistory,
  searchHistory,
  clearHistory,
  exportHistory,
  importHistory,
  type HistoryEntry,
  type HistoryBackup,
} from "@/services/history";
import { deleteEntry } from "@/services/history/delete-entry";
import * as historyDb from "@/services/history/db";
import { ModelKey, Edibility } from "@/core/types";
import { sleep } from "./helpers/promises";
import { makeReport, makeHistoryEntry } from "./helpers/fixtures";

describe("history with IndexedDB", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await clearHistory();
    localStorage.clear();
  });

  it("saves and retrieves an identification", async () => {
    const report = makeReport();
    const id = await saveIdentification(report, ModelKey.BVRA);
    expect(id).toBeTruthy();

    const entries = await getHistory(10);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe(id);
    expect(entries[0]!.top1Species).toBe("Agaricus bisporus");
    expect(entries[0]!.modelKey).toBe(ModelKey.BVRA);
  });

  it("stores thumbnail when provided", async () => {
    const report = makeReport();
    const thumbnail = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    await saveIdentification(report, ModelKey.BVRA, thumbnail);

    const entries = await getHistory(10);
    expect(entries[0]!.thumbnail).toBe(thumbnail);
  });

  it("returns empty array when history is empty", async () => {
    const entries = await getHistory(10);
    expect(entries).toEqual([]);
  });

  it("returns history sorted by timestamp descending", async () => {
    await saveIdentification(
      makeReport({ top1Species: "First" }),
      ModelKey.BVRA,
    );
    await sleep(10);
    await saveIdentification(
      makeReport({ top1Species: "Second" }),
      ModelKey.BVRA,
    );

    const entries = await getHistory(10);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.top1Species).toBe("Second");
    expect(entries[1]!.top1Species).toBe("First");
  });

  it("respects the limit parameter", async () => {
    await saveIdentification(makeReport({ top1Species: "One" }), ModelKey.BVRA);
    await sleep(10);
    await saveIdentification(makeReport({ top1Species: "Two" }), ModelKey.BVRA);
    await sleep(10);
    await saveIdentification(
      makeReport({ top1Species: "Three" }),
      ModelKey.BVRA,
    );

    const entries = await getHistory(2);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.top1Species).toBe("Three");
    expect(entries[1]!.top1Species).toBe("Two");
  });

  it("deletes a single entry", async () => {
    const id = await saveIdentification(makeReport(), ModelKey.BVRA);
    await deleteEntry(id);
    const entries = await getHistory(10);
    expect(entries).toHaveLength(0);
  });

  it("clears all entries", async () => {
    await saveIdentification(makeReport({ top1Species: "A" }), ModelKey.BVRA);
    await saveIdentification(
      makeReport({ top1Species: "B" }),
      ModelKey.Dima806,
    );
    await clearHistory();
    const entries = await getHistory(10);
    expect(entries).toHaveLength(0);
  });

  it("HistoryEntry type is well-formed", () => {
    const entry: HistoryEntry = makeHistoryEntry({
      predictions: [{ label: "Agaricus bisporus", probability: 0.95 }],
    });

    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeTruthy();
    expect(entry.top1Probability).toBeGreaterThan(0.5);
    expect(["Edible", "Poisonous", "Unknown"]).toContain(entry.top1Edibility);
    expect(entry.predictions.length).toBeGreaterThan(0);
  });

  it("retries save without thumbnail on QuotaExceededError", async () => {
    let attempt = 0;
    const withTransactionSpy = vi
      .spyOn(historyDb, "withTransaction")
      .mockImplementation(async (_db, _mode, callback) => {
        const mockStore = {
          add: (value: unknown) => {
            attempt++;
            const entry = value as { thumbnail?: string };
            if (attempt === 1 && entry.thumbnail) {
              throw new DOMException("Quota exceeded", "QuotaExceededError");
            }
            return `id-${String(attempt)}` as unknown as IDBRequest<IDBValidKey>;
          },
        } as unknown as IDBObjectStore;
        return callback(mockStore) as unknown as Promise<string>;
      });

    const report = makeReport();
    const id = await saveIdentification(report, ModelKey.BVRA, "thumb");
    expect(id).toBeTruthy();
    expect(attempt).toBe(2);

    withTransactionSpy.mockRestore();
  });

  it("returns empty history when IndexedDB read fails", async () => {
    const openDBSpy = vi
      .spyOn(historyDb, "openDB")
      .mockRejectedValue(new Error("idb unavailable"));

    const entries = await getHistory(10);
    expect(entries).toEqual([]);

    openDBSpy.mockRestore();
  });

  it("throws when save fails for a non-quota reason", async () => {
    const openDBSpy = vi
      .spyOn(historyDb, "openDB")
      .mockRejectedValue(new Error("save failed"));

    await expect(
      saveIdentification(makeReport(), ModelKey.BVRA),
    ).rejects.toThrow("save failed");

    openDBSpy.mockRestore();
  });

  it("throws when QuotaExceeded occurs without a thumbnail", async () => {
    const withTransactionSpy = vi
      .spyOn(historyDb, "withTransaction")
      .mockRejectedValue(
        new DOMException("Quota exceeded", "QuotaExceededError"),
      );

    await expect(
      saveIdentification(makeReport(), ModelKey.BVRA),
    ).rejects.toThrow("Quota exceeded");

    withTransactionSpy.mockRestore();
  });

  it("throws when QuotaExceeded retry also fails", async () => {
    const withTransactionSpy = vi
      .spyOn(historyDb, "withTransaction")
      .mockRejectedValue(
        new DOMException("Quota exceeded", "QuotaExceededError"),
      );

    await expect(
      saveIdentification(makeReport(), ModelKey.BVRA, "thumb"),
    ).rejects.toThrow("Quota exceeded");

    withTransactionSpy.mockRestore();
  });

  it("returns empty history when the read transaction fails", async () => {
    const openDBSpy = vi.spyOn(historyDb, "openDB").mockResolvedValue({
      transaction: vi.fn().mockReturnValue({
        objectStore: vi.fn().mockReturnValue({
          index: vi.fn().mockReturnValue({
            openCursor: vi.fn().mockReturnValue({
              set onsuccess(_: () => void) {},
              set onerror(handler: () => void) {
                handler();
              },
            }),
          }),
        }),
        set onerror(handler: () => void) {
          handler();
        },
        set onabort(_: () => void) {},
        set oncomplete(_: () => void) {},
      }),
      close: vi.fn(),
    } as unknown as IDBDatabase);

    const entries = await getHistory(10);
    expect(entries).toEqual([]);

    openDBSpy.mockRestore();
  });

  it("exports all history entries as JSON", async () => {
    await saveIdentification(
      makeReport({ top1Species: "Export A" }),
      ModelKey.BVRA,
    );

    const json = await exportHistory();
    const backup = JSON.parse(json) as HistoryBackup;

    expect(backup.version).toBe(1);
    expect(backup.entries).toHaveLength(1);
    expect(backup.entries[0]!.top1Species).toBe("Export A");
    expect(backup.exportedAt).toBeTruthy();
  });

  it("imports history entries from JSON", async () => {
    const backup: HistoryBackup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: [
        makeHistoryEntry({
          id: "imp-1",
          top1Species: "Imported",
          top1Probability: 0.8,
          top1Edibility: Edibility.Unknown,
        }),
      ],
    };

    const count = await importHistory(JSON.stringify(backup));
    expect(count).toBe(1);

    const entries = await getHistory(10);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe("imp-1");
  });

  it("throws when importing invalid JSON", async () => {
    await expect(importHistory("not json")).rejects.toThrow("not valid JSON");
  });

  it("throws when importing a backup with no entries", async () => {
    await expect(importHistory('{"version":1}')).rejects.toThrow("no entries");
  });

  describe("searchHistory", () => {
    beforeEach(async () => {
      await saveIdentification(
        makeReport({
          top1Species: "Agaricus bisporus",
          top1Knowledge: { edibility: Edibility.Edible, notes: "Button." },
          predictions: [
            { label: "Agaricus bisporus", probability: 0.95, index: 0 },
            { label: "Amanita phalloides", probability: 0.03, index: 1 },
          ],
        }),
        ModelKey.BVRA,
      );
      await sleep(10);
      await saveIdentification(
        makeReport({
          top1Species: "Amanita muscaria",
          top1Knowledge: { edibility: Edibility.Poisonous, notes: "Fly agaric." },
          predictions: [
            { label: "Amanita muscaria", probability: 0.91, index: 0 },
            { label: "Russula emetica", probability: 0.05, index: 1 },
          ],
        }),
        ModelKey.Dima806,
      );
    });

    it("returns all entries when query is empty", async () => {
      const entries = await searchHistory("");
      expect(entries).toHaveLength(2);
    });

    it("filters by species case-insensitively", async () => {
      const entries = await searchHistory("BISPORUS");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.top1Species).toBe("Agaricus bisporus");
    });

    it("filters by edibility", async () => {
      const entries = await searchHistory("poisonous");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.top1Species).toBe("Amanita muscaria");
    });

    it("matches prediction labels that are not top-1", async () => {
      const entries = await searchHistory("phalloides");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.top1Species).toBe("Agaricus bisporus");
    });

    it("requires every token to match", async () => {
      const entries = await searchHistory("agaricus edible");
      expect(entries).toHaveLength(1);
      expect(entries[0]!.top1Species).toBe("Agaricus bisporus");
    });

    it("returns empty array when nothing matches", async () => {
      const entries = await searchHistory("boletus");
      expect(entries).toEqual([]);
    });

    it("respects the limit", async () => {
      await saveIdentification(
        makeReport({ top1Species: "Agaricus augustus" }),
        ModelKey.BVRA,
      );
      const entries = await searchHistory("Agaricus", { limit: 2 });
      expect(entries).toHaveLength(2);
    });
  });
});
