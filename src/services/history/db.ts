const DB_NAME = "foragerflow-history";
const DB_VERSION = 2;
export const STORE_NAME = "identifications";
const META_STORE_NAME = "history_meta";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("modelKey", "modelKey", { unique: false });
        store.createIndex("edibility", "top1Edibility", { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        db.createObjectStore(META_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(new Error(request.error?.message ?? "IndexedDB open failed"));
    };
    request.onblocked = () => {
      reject(new Error("IndexedDB open blocked by another tab"));
    };
  });
  return dbPromise;
}

export async function closeDB(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) {
    try {
      const db = await p;
      db.close();
    } catch {
      /* ignore failed/incomplete opens */
    }
  }
}

export function withTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    let value: T | undefined;
    let rejected = false;

    tx.oncomplete = () => {
      if (!rejected) {
        resolve(value as T);
      }
    };
    tx.onerror = () => {
      rejected = true;
      reject(new Error(tx.error?.message ?? "IDB transaction failed"));
    };
    tx.onabort = () => {
      rejected = true;
      reject(new Error("IDB transaction aborted"));
    };

    const request = fn(tx.objectStore(STORE_NAME));
    request.onsuccess = () => {
      value = request.result as T;
    };
    request.onerror = () => {
      rejected = true;
      reject(new Error(request.error?.message ?? "IDB request failed"));
    };
  });
}

export async function getMeta(key: string): Promise<unknown> {
  const db = await openDB();
  return new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction(META_STORE_NAME, "readonly");
    const request = tx.objectStore(META_STORE_NAME).get(key);
    request.onsuccess = () => {
      const record = request.result as { value: unknown } | undefined;
      resolve(record?.value);
    };
    request.onerror = () => {
      reject(new Error(request.error?.message ?? "IDB meta read failed"));
    };
  });
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE_NAME, "readwrite");
    const request = tx.objectStore(META_STORE_NAME).put({ key, value });
    tx.oncomplete = () => {
      resolve();
    };
    tx.onabort = () => {
      reject(new Error("IDB meta transaction aborted"));
    };
    request.onerror = () => {
      reject(new Error(request.error?.message ?? "IDB meta write failed"));
    };
  });
}
