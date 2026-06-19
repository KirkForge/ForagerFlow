import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  openDB,
  withTransaction,
  STORE_NAME,
  getMeta,
  setMeta,
  closeDB,
} from "@/services/history/db";
import {
  deleteHistoryDB,
  createErrorRequest,
  createBlockedRequest,
  createMockTransaction,
} from "./helpers/idb";

const originalIndexedDBOpen = indexedDB.open;

describe("history db", () => {
  beforeEach(async () => {
    await closeDB().catch(() => {
      /* ignore closed/rejected connections */
    });
    await deleteHistoryDB();
  });

  afterEach(async () => {
    indexedDB.open = originalIndexedDBOpen;
    await closeDB().catch(() => {
      /* ignore closed/rejected connections */
    });
    await deleteHistoryDB();
  });

  it("opens the database at version 2 and creates the meta store", async () => {
    const db = await openDB();
    expect(db.version).toBe(2);
    expect(db.objectStoreNames.contains(STORE_NAME)).toBe(true);
    expect(db.objectStoreNames.contains("history_meta")).toBe(true);
    db.close();
  });

  it("adds and retrieves an entry with withTransaction", async () => {
    const entry = { id: "entry-1", timestamp: new Date().toISOString() };
    const db = await openDB();
    const key = await withTransaction<string>(db, "readwrite", (store) =>
      store.add(entry),
    );

    const db2 = await openDB();
    const roundTrip = await withTransaction(db2, "readonly", (store) =>
      store.get(key),
    );
    expect(roundTrip).toEqual(entry);
  });

  it("rejects when IndexedDB open fails", async () => {
    indexedDB.open = vi.fn(() =>
      createErrorRequest(new Error("blocked")),
    ) as unknown as typeof indexedDB.open;

    await expect(openDB()).rejects.toThrow("blocked");
  });

  it("rejects when transaction aborts", async () => {
    const db = await openDB();
    const originalTransaction = db.transaction.bind(db);
    db.transaction = vi.fn().mockReturnValue(
      createMockTransaction(STORE_NAME, {
        abortError: new Error("aborted"),
      }),
    ) as unknown as typeof db.transaction;

    await expect(
      withTransaction(db, "readwrite", (store) => store.add({ id: "x" })),
    ).rejects.toThrow("aborted");

    db.transaction = originalTransaction;
    db.close();
  });

  it("rejects when request errors", async () => {
    const db = await openDB();
    const originalTransaction = db.transaction.bind(db);
    db.transaction = vi.fn().mockReturnValue(
      createMockTransaction(STORE_NAME, {
        requestError: new Error("add failed"),
      }),
    ) as unknown as typeof db.transaction;

    await expect(
      withTransaction(db, "readwrite", (store) => store.add({ id: "x" })),
    ).rejects.toThrow("add failed");

    db.transaction = originalTransaction;
    db.close();
  });

  it("rejects when IndexedDB open is blocked", async () => {
    indexedDB.open = vi.fn(() =>
      createBlockedRequest(),
    ) as unknown as typeof indexedDB.open;

    await expect(openDB()).rejects.toThrow("blocked");
  });

  it("applies migrations when upgrading from version 1", async () => {
    const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("foragerflow-history", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("identifications")) {
          db.createObjectStore("identifications", { keyPath: "id" });
        }
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(new Error(String(req.error)));
      };
    });
    expect(v1.objectStoreNames.contains("history_meta")).toBe(false);
    v1.close();

    const db = await openDB();
    expect(db.version).toBe(2);
    expect(db.objectStoreNames.contains("history_meta")).toBe(true);
    db.close();
  });

  it("reads and writes meta values", async () => {
    await setMeta("lastBackupAt", "2024-01-01T00:00:00Z");
    const value = (await getMeta("lastBackupAt")) as string | undefined;
    expect(value).toBe("2024-01-01T00:00:00Z");
  });
});
