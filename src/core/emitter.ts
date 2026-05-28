type EventMap = { [key: string]: unknown };

type EventKey<T extends EventMap> = string & keyof T;

type EventCallback<T> = T extends undefined ? () => void : (payload: T) => void;

/**
 * Type-safe event emitter. Replaces the loose string-based
 * .on() pattern in InferenceService with compile-time guarantees.
 */
export class TypedEmitter<Events extends EventMap> {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on<K extends EventKey<Events>>(event: K, callback: EventCallback<Events[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as (...args: unknown[]) => void);
  }

  off<K extends EventKey<Events>>(event: K, callback: EventCallback<Events[K]>): void {
    this.listeners.get(event)?.delete(callback as (...args: unknown[]) => void);
  }

  emit<K extends EventKey<Events>>(event: K, ...args: Events[K] extends undefined ? [] : [Events[K]]): void {
    for (const cb of this.listeners.get(event) ?? []) {
      (cb as (...a: unknown[]) => void)(...args);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
