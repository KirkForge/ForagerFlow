import { vi } from "vitest";

const DB_NAME = "foragerflow-history";

export async function deleteHistoryDB(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      resolve();
    };
    req.onerror = () => {
      reject(new Error(String(req.error)));
    };
  });
}

export function createErrorRequest(error: Error): IDBOpenDBRequest {
  const request = {
    set onsuccess(_: () => void) {
      /* no-op */
    },
    set onerror(handler: () => void) {
      Object.defineProperty(this, "error", {
        value: error,
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
}

export function createBlockedRequest(): IDBOpenDBRequest {
  const request = {
    set onsuccess(_: () => void) {
      /* no-op */
    },
    set onerror(_: () => void) {
      /* no-op */
    },
    set onupgradeneeded(_: () => void) {
      /* no-op */
    },
    set onblocked(handler: () => void) {
      handler();
    },
    result: null,
  } as unknown as IDBOpenDBRequest;
  return request;
}

export interface MockIDBTransactionOptions {
  abortError?: Error;
  requestError?: Error;
}

export function createMockTransaction(
  _storeName: string,
  opts: MockIDBTransactionOptions = {},
): IDBTransaction {
  const { abortError, requestError } = opts;
  return {
    objectStore: vi.fn().mockReturnValue({
      add: vi.fn().mockReturnValue({
        set onsuccess(_: () => void) {
          /* no-op */
        },
        set onerror(handler: () => void) {
          if (requestError) {
            Object.defineProperty(this, "error", {
              value: requestError,
              configurable: true,
            });
            handler();
          }
        },
      }),
    }),
    set onabort(handler: () => void) {
      if (abortError) handler();
    },
    set oncomplete(_: () => void) {
      /* no-op */
    },
    set onerror(_: () => void) {
      /* no-op */
    },
  } as unknown as IDBTransaction;
}

export function mockIndexedDBOpen(
  requestFactory: () => IDBOpenDBRequest,
): () => void {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalOpen = indexedDB.open;
  indexedDB.open = vi.fn(requestFactory);
  return () => {
    indexedDB.open = originalOpen;
  };
}
