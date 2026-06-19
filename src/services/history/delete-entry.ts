// services/history/delete-entry.ts
// Dynamically imported by main.ts when the user taps a history row's
// delete button. Kept in a separate module so the static bundle does
// not pay for it on first paint.

import { logger } from "@/core/logger";
import { openDB, withTransaction } from "./db";

export async function deleteEntry(id: string): Promise<void> {
  try {
    const db = await openDB();
    await withTransaction(db, "readwrite", (store) => store.delete(id));
  } catch (err) {
    logger.error("Failed to delete entry:", err);
    throw err;
  }
}
