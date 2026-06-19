import { vi } from "vitest";

export interface MockWorker {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export function createMockWorkerFactory(
  onInstance?: (instance: MockWorker) => void,
): { MockWorker: typeof globalThis.Worker; instances: MockWorker[] } {
  const instances: MockWorker[] = [];

  class WorkerImpl implements MockWorker {
    postMessage = vi.fn();
    terminate = vi.fn();
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;

    constructor() {
      instances.push(this);
      onInstance?.(this);
    }
  }

  return {
    MockWorker: WorkerImpl as unknown as typeof globalThis.Worker,
    instances,
  };
}

export function installMockWorker(
  onInstance?: (instance: MockWorker) => void,
): { restore: () => void; instances: MockWorker[] } {
  const originalWorker = globalThis.Worker;
  const { MockWorker, instances } = createMockWorkerFactory(onInstance);
  globalThis.Worker = MockWorker;

  return {
    restore: () => {
      globalThis.Worker = originalWorker;
    },
    instances,
  };
}

export function sendWorkerMessage(worker: MockWorker, message: unknown): void {
  if (worker.onmessage) {
    worker.onmessage(new MessageEvent("message", { data: message }));
  }
}
