import type { PredictionReport } from "@/inference/results";
import { ModelKey, Edibility } from "@/core/types";
import type {
  ModelKey as ModelKeyType,
  Edibility as EdibilityType,
} from "@/core/types";
import { logger } from "@/core/logger";
import { openDB, withTransaction, setMeta, STORE_NAME } from "./db";

export interface HistoryEntry {
  id: string;
  timestamp: string;
  modelKey: ModelKey;
  top1Species: string;
  top1Probability: number;
  top1Edibility: Edibility;
  predictions: { label: string; probability: number }[];
  thumbnail: string;
  notes: string;
}

export interface HistoryBackup {
  version: number;
  exportedAt: string;
  entries: HistoryEntry[];
}

function makeEntry(
  report: PredictionReport,
  modelKey: ModelKey,
  thumbnail?: string,
): HistoryEntry {
  return {
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
}

function isQuotaExceeded(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.name === "QuotaExceeded")
  );
}

const DATA_URL_RE = /^data:image\/[a-z0-9+]+;base64,/i;

export function isDataUrlThumbnail(value: unknown): value is string {
  return typeof value === "string" && (value === "" || DATA_URL_RE.test(value));
}

function isValidEdibility(value: unknown): value is EdibilityType {
  return (
    typeof value === "string" &&
    Object.values(Edibility).includes(value as EdibilityType)
  );
}

function isValidModelKey(value: unknown): value is ModelKeyType {
  return (
    typeof value === "string" &&
    Object.values(ModelKey).includes(value as ModelKeyType)
  );
}

function isValidPrediction(
  value: unknown,
): value is { label: string; probability: number } {
  if (!value || typeof value !== "object") return false;
  const { label, probability } = value as Record<string, unknown>;
  return (
    typeof label === "string" &&
    label.length > 0 &&
    typeof probability === "number" &&
    Number.isFinite(probability) &&
    probability >= 0 &&
    probability <= 1
  );
}

function validateHistoryEntry(raw: unknown, index: number): HistoryEntry {
  if (!raw || typeof raw !== "object") {
    throw new Error(`History entry ${String(index + 1)} is not an object`);
  }

  const entry = raw as Record<string, unknown>;

  const id = entry["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`History entry ${String(index + 1)} has invalid id`);
  }

  const timestamp = entry["timestamp"];
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`History entry ${String(index + 1)} has invalid timestamp`);
  }

  const modelKey = entry["modelKey"];
  if (!isValidModelKey(modelKey)) {
    throw new Error(
      `History entry ${String(index + 1)} has invalid modelKey: ${String(modelKey)}`,
    );
  }

  const top1Species = entry["top1Species"];
  if (typeof top1Species !== "string" || top1Species.length === 0) {
    throw new Error(
      `History entry ${String(index + 1)} has invalid top1Species`,
    );
  }

  const top1Probability = entry["top1Probability"];
  if (
    typeof top1Probability !== "number" ||
    !Number.isFinite(top1Probability) ||
    top1Probability < 0 ||
    top1Probability > 1
  ) {
    throw new Error(
      `History entry ${String(index + 1)} has invalid top1Probability`,
    );
  }

  const top1Edibility = entry["top1Edibility"];
  if (!isValidEdibility(top1Edibility)) {
    throw new Error(
      `History entry ${String(index + 1)} has invalid top1Edibility: ${String(top1Edibility)}`,
    );
  }

  const predictions = entry["predictions"];
  if (!Array.isArray(predictions) || !predictions.every(isValidPrediction)) {
    throw new Error(
      `History entry ${String(index + 1)} has invalid predictions`,
    );
  }

  const thumbnail = entry["thumbnail"];
  if (!isDataUrlThumbnail(thumbnail)) {
    throw new Error(
      `History entry ${String(index + 1)} has invalid thumbnail (must be empty or a data:image/ base64 URL)`,
    );
  }

  const notes = entry["notes"];
  const notesString = typeof notes === "string" ? notes : "";

  return {
    id,
    timestamp,
    modelKey,
    top1Species,
    top1Probability,
    top1Edibility,
    predictions,
    thumbnail,
    notes: notesString,
  };
}

export async function saveIdentification(
  report: PredictionReport,
  modelKey: ModelKey,
  thumbnail?: string,
): Promise<string> {
  const entry = makeEntry(report, modelKey, thumbnail);

  try {
    const db = await openDB();
    return await withTransaction<string>(db, "readwrite", (store) =>
      store.add(entry),
    );
  } catch (err) {
    if (isQuotaExceeded(err) && thumbnail) {
      logger.warn(
        "Quota exceeded saving identification with thumbnail; retrying without thumbnail",
      );
      try {
        const db = await openDB();
        const entryNoThumb = { ...entry, thumbnail: "" };
        return await withTransaction<string>(db, "readwrite", (store) =>
          store.add(entryNoThumb),
        );
      } catch (retryErr) {
        logger.error("Failed to save identification (retry):", retryErr);
        throw retryErr;
      }
    }
    logger.error("Failed to save identification:", err);
    throw err;
  }
}

export async function getHistory(limit = 50): Promise<HistoryEntry[]> {
  try {
    const db = await openDB();
    const results: HistoryEntry[] = [];
    return await new Promise<HistoryEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("timestamp");
      const request = index.openCursor(null, "prev");

      tx.oncomplete = () => {
        resolve(results);
      };
      tx.onerror = () => {
        reject(new Error(tx.error?.message ?? "IDB transaction failed"));
      };
      tx.onabort = () => {
        reject(new Error("IDB transaction aborted"));
      };

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value as HistoryEntry);
          cursor.continue();
        }
      };
      request.onerror = () => {
        reject(new Error(request.error?.message ?? "IDB request failed"));
      };
    });
  } catch (err) {
    logger.error("Failed to load history:", err);
    return [];
  }
}

export async function clearHistory(): Promise<void> {
  const db = await openDB();
  await withTransaction<undefined>(db, "readwrite", (store) => store.clear());
}

async function recordBackupTimestamp(iso: string): Promise<void> {
  try {
    await setMeta("lastBackupAt", iso);
  } catch (err) {
    logger.warn("Failed to record backup timestamp:", err);
  }
}

export async function exportHistory(): Promise<string> {
  const entries = await getHistory(10_000);
  const backup: HistoryBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
  };
  await recordBackupTimestamp(backup.exportedAt);
  return JSON.stringify(backup);
}

export async function importHistory(json: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Backup file is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object" || !("entries" in parsed)) {
    throw new Error("Backup file has no entries");
  }

  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    throw new Error("Backup entries are not an array");
  }

  if ((parsed as { version?: unknown }).version !== 1) {
    throw new Error("Backup version is unsupported");
  }

  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  let imported = 0;
  for (const [index, raw] of entries.entries()) {
    const entry = validateHistoryEntry(raw, index);
    store.put(entry);
    imported++;
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(new Error(tx.error?.message ?? "IDB import failed"));
    };
    tx.onabort = () => {
      reject(new Error("IDB import aborted"));
    };
  });

  await recordBackupTimestamp(new Date().toISOString());
  return imported;
}
