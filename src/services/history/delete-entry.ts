// services/history/delete-entry.ts
// Dynamically imported by main.ts when the user taps a history row's
// delete button. Kept in a separate module so the static bundle does
// not pay for it on first paint.

import { logger } from "@/core/logger";

const DB_NAME = "foragerflow-history";
const DB_VERSION = 1;
const STORE_NAME = "identifications";

function openDB(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("modelKey", "modelKey", { unique: false });
        store.createIndex("edibility", "top1Edibility", { unique: false });
      }
    };
    request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => { reject(new Error(request.error?.message ?? "IndexedDB open failed")); };
  });
}

export async function deleteEntry(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => {
        db.close();
        resolve();
      };
      request.onerror = () => {
        db.close();
        reject(new Error(request.error?.message ?? "IDB error"));
      };
    });
  } catch (err) {
    logger.error("Failed to delete entry:", err);
    throw err;
  }
}
