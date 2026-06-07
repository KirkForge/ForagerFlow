// services/history/index.ts
// IndexedDB-backed identification history for Foragerflow.
// Stores past predictions for offline review.
//
// The barrel re-exports the read and write APIs so main.ts can import them
// statically. `deleteEntry` lives in a separate module (delete-entry.ts) so
// the per-row delete handler can import it dynamically — Vite will then put
// the delete code in its own chunk and main.ts does not pay for it on first
// paint.

import type { PredictionReport } from "@/inference/results";
import type { ModelKey, Edibility } from "@/core/types";
import { logger } from "@/core/logger";

const DB_NAME = "foragerflow-history";
const DB_VERSION = 1;
const STORE_NAME = "identifications";

export interface HistoryEntry {
  id: string;
  timestamp: string;
  modelKey: ModelKey;
  top1Species: string;
  top1Probability: number;
  top1Edibility: Edibility;
  predictions: { label: string; probability: number }[];
  thumbnail: string; // base64 data URL (small)
  notes: string;
}

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

export async function saveIdentification(
  report: PredictionReport,
  modelKey: ModelKey,
  thumbnail?: string,
): Promise<string> {
  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    modelKey,
    top1Species: report.top1Species,
    top1Probability: report.top1Probability,
    top1Edibility: report.top1Knowledge.edibility,
    predictions: report.predictions.map((p) => ({
      label: p.label,
      probability: p.probability,
    })),
    thumbnail: thumbnail ?? "",
    notes: report.top1Knowledge.notes,
  };

  try {
    const db = await openDB();
    return await new Promise<string>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(entry);
      request.onsuccess = () => {
        db.close();
        resolve(entry.id);
      };
      request.onerror = () => {
        db.close();
        reject(new Error(request.error?.message ?? "IDB error"));
      };
    });
  } catch (err) {
    logger.error("Failed to save identification:", err);
    throw err;
  }
}

export async function getHistory(
  limit = 50,
): Promise<HistoryEntry[]> {
  try {
    const db = await openDB();
    return await new Promise<HistoryEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("timestamp");
      const request = index.openCursor(null, "prev");
      const results: HistoryEntry[] = [];

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value as HistoryEntry);
          cursor.continue();
        } else {
          db.close();
          resolve(results);
        }
      };
      request.onerror = () => {
        db.close();
        reject(new Error(request.error?.message ?? "IDB error"));
      };
    });
  } catch (err) {
    logger.error("Failed to load history:", err);
    return [];
  }
}

export async function clearHistory(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
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
    logger.error("Failed to clear history:", err);
    throw err;
  }
}
