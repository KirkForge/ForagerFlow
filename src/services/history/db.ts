const DB_NAME = "foragerflow-history";
const DB_VERSION = 2;
export const STORE_NAME = "identifications";
const META_STORE_NAME = "history_meta";

export interface IDBResult<T> {
  value: T;
  done: boolean;
}

type MigrationFn = (db: IDBDatabase) => void;

const migrations: Record<number, MigrationFn> = {
  2: (db) => {
    if (!db.objectStoreNames.contains(META_STORE_NAME)) {
      db.createObjectStore(META_STORE_NAME, { keyPath: "key" });
    }
  },
};

function runMigrations(
  db: IDBDatabase,
  oldVersion: number,
  newVersion: number,
): void {
  for (let v = oldVersion + 1; v <= newVersion; v++) {
    migrations[v]?.(db);
  }
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("modelKey", "modelKey", { unique: false });
        store.createIndex("edibility", "top1Edibility", { unique: false });
      }
      const newVersion = event.newVersion ?? db.version;
      runMigrations(db, event.oldVersion, newVersion);
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
}

export function withTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T>;
export function withTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  storeName: string,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T>;
export function withTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  storeNameOrFn: string | ((store: IDBObjectStore) => IDBRequest),
  fn?: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const storeName =
    typeof storeNameOrFn === "string" ? storeNameOrFn : STORE_NAME;
  const storeFn =
    typeof storeNameOrFn === "function" ? storeNameOrFn : fn;

  if (!storeFn) {
    throw new Error("withTransaction requires a store function");
  }

  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    let value: T | undefined;
    let rejected = false;

    tx.oncomplete = () => {
      db.close();
      if (!rejected) {
        resolve(value as T);
      }
    };
    tx.onerror = () => {
      rejected = true;
      db.close();
      reject(new Error(tx.error?.message ?? "IDB transaction failed"));
    };
    tx.onabort = () => {
      rejected = true;
      db.close();
      reject(new Error("IDB transaction aborted"));
    };

    const request = storeFn(tx.objectStore(storeName));
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
  const record = await withTransaction<{ key: string; value: unknown } | undefined>(
    db,
    "readonly",
    META_STORE_NAME,
    (store) => store.get(key),
  );
  return record?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  await withTransaction(
    db,
    "readwrite",
    META_STORE_NAME,
    (store) => store.put({ key, value }),
  );
}

export { META_STORE_NAME };
