import CellManager from "./cell-manager";

export function addOrReplaceChildren(parent: HTMLElement, child: string | HTMLElement | HTMLElement[]): void {
  if (typeof child === "string") {
    parent.innerHTML = child;
  } else if (Array.isArray(child)) {
    parent.replaceChildren(...child);
  } else {
    parent.replaceChildren(child);
  }
}

export interface PlaceCellOpts {
  key: string;
  cls: string;
  gridRow: number;
  gridCol: number;
  hintContentDirty?: boolean;
  extraStyles: {
    colspan?: number;
    rowspan?: number;
    top?: number;
    left?: number;
    transform?: string;
    width?: number;
    minWidth?: number;
    maxWidth?: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = object> = abstract new (...args: any[]) => T;

interface HasCellManager {
  cellManager: CellManager;
}

export function WithCellPlacement<TBase extends Constructor<HasCellManager>>(Base: TBase) {
  abstract class Mixed extends Base {
    placeCellInDom(opts: PlaceCellOpts): [HTMLElement, boolean, boolean] {
      const [cell, needAppend] = this.cellManager.acquire(opts.key);
      const contentDirty = needAppend || !opts.hintContentDirty;

      const cellCls = "cell " + opts.cls;
      if (cell.className !== cellCls) {
        cell.className = cellCls;
      }

      const gridCol = opts.extraStyles.colspan
        ? `${opts.gridCol} / span ${opts.extraStyles.colspan}`
        : `${opts.gridCol}`;
      if (cell.style.gridColumn !== gridCol) {
        cell.style.gridColumn = gridCol;
      }
      const gridRow = opts.extraStyles.rowspan
        ? `${opts.gridRow} / span ${opts.extraStyles.rowspan}`
        : `${opts.gridRow}`;
      if (cell.style.gridRow !== gridRow) {
        cell.style.gridRow = gridRow;
      }

      if (opts.extraStyles.top !== undefined) {
        cell.style.top = `${opts.extraStyles.top}px`;
      }
      if (opts.extraStyles.left !== undefined) {
        cell.style.left = `${opts.extraStyles.left}px`;
      }
      if (opts.extraStyles.transform !== undefined && cell.style.transform !== opts.extraStyles.transform) {
        cell.style.transform = opts.extraStyles.transform;
      }
      if (opts.extraStyles.width !== undefined) {
        cell.style.width = `${opts.extraStyles.width}px`;
      }
      if (opts.extraStyles.minWidth !== undefined) {
        cell.style.minWidth = `${opts.extraStyles.minWidth}px`;
      }
      if (opts.extraStyles.maxWidth !== undefined) {
        cell.style.maxWidth = `${opts.extraStyles.maxWidth}px`;
      }

      return [cell, needAppend, contentDirty];
    }
  }
  return Mixed;
}

type EventHandler<T> = (payload: T) => void;

export interface EventEmitter<TEvents extends Record<string, unknown>> {
  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): () => void;
  off<K extends keyof TEvents>(event: K, handler?: EventHandler<TEvents[K]>): void;
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void;
  forwardFrom<TSource extends Record<string, unknown>>(
    source: EventEmitter<TSource>,
    events: (keyof TSource & keyof TEvents)[]
  ): () => void;
}

export function WithEvents<TEvents extends Record<string, unknown>>() {
  return function <TBase extends Constructor>(Base: TBase) {
    abstract class Mixed extends Base implements EventEmitter<TEvents> {
      #listeners = new Map<keyof TEvents, Set<EventHandler<unknown>>>();

      on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): () => void {
        if (!this.#listeners.has(event)) {
          this.#listeners.set(event, new Set());
        }
        this.#listeners.get(event)!.add(handler as EventHandler<unknown>);
        return () => this.off(event, handler);
      }

      off<K extends keyof TEvents>(event: K, handler?: EventHandler<TEvents[K]>): void {
        if (!handler) {
          this.#listeners.delete(event);
        } else {
          this.#listeners.get(event)?.delete(handler as EventHandler<unknown>);
        }
      }

      emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
        setTimeout(() => {
          this.#listeners.get(event)?.forEach((handler) => handler(payload));
        }, 0);
      }

      forwardFrom<TSource extends Record<string, unknown>>(
        source: EventEmitter<TSource>,
        events: (keyof TSource & keyof TEvents)[]
      ): () => void {
        const unsubscribers: (() => void)[] = [];

        for (const event of events) {
          const unsub = source.on(event, (payload) => {
            this.emit(event as keyof TEvents, payload as unknown as TEvents[keyof TEvents]);
          });
          unsubscribers.push(unsub);
        }

        return () => unsubscribers.forEach((unsub) => unsub());
      }
    }
    return Mixed;
  };
}
