import { logger } from "@/core/logger";
import { config } from "@/core/config";
import { getHistory } from "@/services/history";
import { setMeta, getMeta, openDB, STORE_NAME } from "@/services/history/db";
import type { HistoryEntry } from "@/services/history";
import { isDataUrlThumbnail, isValidLocation } from "@/services/history";

const LAST_SYNC_KEY = "lastSyncAt";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function stripThumbnails(entries: HistoryEntry[]): HistoryEntry[] {
  return entries.map((entry) => ({ ...entry, thumbnail: "" }));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status >= 500 && attempt < retries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(
          `Sync server error ${String(response.status)}, retrying in ${String(delay)}ms`,
        );
        await sleep(delay);
        continue;
      }
      return response;
    } catch (err) {
      if (attempt < retries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        logger.warn(`Sync network error, retrying in ${String(delay)}ms:`, err);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

function getSyncUrl(): string | undefined {
  return config.syncUrl || undefined;
}

function getSyncToken(): string | undefined {
  return config.syncToken || undefined;
}

export async function push(): Promise<void> {
  const url = getSyncUrl();
  const token = getSyncToken();
  if (!url || !token) {
    logger.debug("Sync skipped: VITE_SYNC_URL or VITE_SYNC_TOKEN not set");
    return;
  }

  const lastSyncAt = (await getMeta(LAST_SYNC_KEY)) as string | undefined;

  const allEntries = await getHistory(10_000);
  const entriesToSync = lastSyncAt
    ? allEntries.filter((e) => e.timestamp > lastSyncAt)
    : allEntries;

  if (entriesToSync.length === 0) {
    logger.debug("Sync push: no new entries since last sync");
    return;
  }

  const payload = stripThumbnails(entriesToSync);

  try {
    const response = await fetchWithRetry(`${url}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ entries: payload }),
    });

    if (!response.ok) {
      logger.warn(`Sync push failed: ${String(response.status)}`);
      return;
    }

    await setMeta(LAST_SYNC_KEY, new Date().toISOString());
    logger.info(`Sync push: ${String(entriesToSync.length)} entries synced`);
  } catch (err) {
    logger.error("Sync push error:", err);
  }
}

export async function pull(): Promise<void> {
  const url = getSyncUrl();
  const token = getSyncToken();
  if (!url || !token) {
    logger.debug("Sync skipped: VITE_SYNC_URL or VITE_SYNC_TOKEN not set");
    return;
  }

  try {
    const response = await fetchWithRetry(`${url}/sync`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      logger.warn(`Sync pull failed: ${String(response.status)}`);
      return;
    }

    const data = (await response.json()) as {
      entries: HistoryEntry[];
    };

    if (!Array.isArray(data.entries)) {
      logger.warn("Sync pull: server returned non-array entries");
      return;
    }

    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    let merged = 0;
    for (const raw of data.entries) {
      const existing = store.get(raw.id) as IDBRequest<
        HistoryEntry | undefined
      >;
      const entry = existing.result;
      if (!entry) {
        const sanitized: HistoryEntry = {
          id: raw.id,
          timestamp: raw.timestamp,
          modelKey: raw.modelKey,
          top1Species: raw.top1Species,
          top1Probability: raw.top1Probability,
          top1Edibility: raw.top1Edibility,
          predictions: raw.predictions,
          thumbnail: isDataUrlThumbnail(raw.thumbnail) ? raw.thumbnail : "",
          notes: typeof raw.notes === "string" ? raw.notes.slice(0, 1000) : "",
        };
        if (isValidLocation(raw.location)) {
          sanitized.location = raw.location;
        }
        if (raw.provenance) {
          sanitized.provenance = raw.provenance;
        }
        store.put(sanitized);
        merged++;
      } else if (raw.timestamp > entry.timestamp) {
        const updated: HistoryEntry = {
          ...entry,
          ...raw,
          timestamp: raw.timestamp,
        };
        store.put(updated);
        merged++;
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error(tx.error?.message ?? "IDB sync merge failed"));
      tx.onabort = () => reject(new Error("IDB sync merge aborted"));
    });

    logger.info(`Sync pull: ${String(merged)} entries merged`);
  } catch (err) {
    logger.error("Sync pull error:", err);
  }
}

export async function sync(): Promise<void> {
  await push();
  await pull();
}
