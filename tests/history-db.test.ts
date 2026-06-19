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

const originalIndexedDBOpen = indexedDB.open;

async function deleteHistoryDB(): Promise<void> {
  await closeDB().catch(() => {
    /* ignore closed/rejected connections */
  });
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("foragerflow-history");
    req.onsuccess = () => { resolve(); };
    req.onerror = () => { reject(new Error(String(req.error))); };
  });
}

describe("history db", () => {
  beforeEach(async () => {
    // Ensure a fresh database for each test.
    await deleteHistoryDB();
  });

  afterEach(async () => {
    indexedDB.open = originalIndexedDBOpen;
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
    const originalOpen = indexedDB.open;
    indexedDB.open = vi.fn(() => {
      const request = {
        set onsuccess(_: () => void) {
          /* no-op */
        },
        set onerror(handler: () => void) {
          Object.defineProperty(this, "error", {
            value: new Error("blocked"),
            configurable: true,
          });
          handler();
        },
        set onupgradeneeded(_: () => void) {
          /* no-op */
        },
        set onblocked(_: () => void) {
          /* no-op */
        },
        result: null,
      } as unknown as IDBOpenDBRequest;
      return request;
    });

    await expect(openDB()).rejects.toThrow("blocked");
    indexedDB.open = originalOpen;
  });

  it("rejects when transaction aborts", async () => {
    const db = await openDB();
    const originalTransaction = db.transaction.bind(db);
    db.transaction = vi.fn(() => {
      const tx = {
        objectStore: () => ({
          add: () => ({
            set onsuccess(_: () => void) {},
            set onerror(_: () => void) {},
          }),
        }),
        set onabort(handler: () => void) {
          handler();
        },
        set oncomplete(_: () => void) {},
        set onerror(_: () => void) {},
      } as unknown as IDBTransaction;
      return tx;
    }) as unknown as typeof db.transaction;

    await expect(
      withTransaction(db, "readwrite", (store) => store.add({ id: "x" })),
    ).rejects.toThrow("aborted");

    db.transaction = originalTransaction;
    db.close();
  });

  it("rejects when request errors", async () => {
    const db = await openDB();
    const originalTransaction = db.transaction.bind(db);
    db.transaction = vi.fn(() => {
      const tx = {
        objectStore: () => ({
          add: () => ({
            set onsuccess(_: () => void) {},
            set onerror(handler: () => void) {
              Object.defineProperty(this, "error", {
                value: new Error("add failed"),
                configurable: true,
              });
              handler();
            },
          }),
        }),
        set onabort(_: () => void) {},
        set oncomplete(_: () => void) {},
        set onerror(_: () => void) {},
      } as unknown as IDBTransaction;
      return tx;
    }) as unknown as typeof db.transaction;

    await expect(
      withTransaction(db, "readwrite", (store) => store.add({ id: "x" })),
    ).rejects.toThrow("add failed");

    db.transaction = originalTransaction;
    db.close();
  });

  it("rejects when IndexedDB open is blocked", async () => {
    const originalOpen = indexedDB.open;
    indexedDB.open = vi.fn(() => {
      const request = {
        set onsuccess(_: () => void) {},
        set onerror(_: () => void) {},
        set onupgradeneeded(_: () => void) {},
        set onblocked(handler: () => void) {
          handler();
        },
        result: null,
      } as unknown as IDBOpenDBRequest;
      return request;
    });

    await expect(openDB()).rejects.toThrow("blocked");
    indexedDB.open = originalOpen;
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
      req.onsuccess = () => { resolve(req.result); };
      req.onerror = () => { reject(new Error(String(req.error))); };
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

