import { logger } from "@/core/logger";
import { openDB, withTransaction } from "./db";

export async function deleteEntry(id: string): Promise<void> {
  try {
    const db = await openDB();
    await withTransaction<undefined>(db, "readwrite", (store) =>
      store.delete(id),
    );
  } catch (err) {
    logger.error("Failed to delete entry:", err);
    throw err;
  }
}
