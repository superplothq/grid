export type EventHandler<T = unknown> = (payload: T) => void;

export class EventEmitter<TEvents extends object = Record<string, unknown>> {
  #listeners: Map<keyof TEvents, Set<EventHandler<unknown>>> = new Map();

  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event)!.add(handler as EventHandler<unknown>);
  }

  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const handlers = this.#listeners.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<unknown>);
    }
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const handlers = this.#listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(payload));
    }
  }

  removeAllListeners(event?: keyof TEvents): void {
    if (event) {
      this.#listeners.delete(event);
    } else {
      this.#listeners.clear();
    }
  }
}
