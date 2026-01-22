import {GridConfig} from "../config";
import {PLayout} from "./layout-proto";
import {PRenderer} from "./renderer-proto";

/**
 * Cell pool for reusing DOM elements.
 * Reduces GC pressure and DOM operations during scroll.
 */
export class CellPool {
  #pool: HTMLElement[] = [];

  acquire(): HTMLElement {
    if (this.#pool.length > 0) {
      return this.#pool.pop()!;
    }
    const cell = document.createElement("div");
    cell.className = "cell";
    return cell;
  }

  release(cell: HTMLElement): void {
    cell.className = "cell";
    cell.style.cssText = "";
    cell.textContent = "";
    this.#pool.push(cell);
  }

  get size(): number {
    return this.#pool.length;
  }
}

/**
 * Base renderer with cell pooling and DOM management.
 * Provides common infrastructure for all layout renderers.
 */
export abstract class RendererBase extends PRenderer {
  protected cellPool: CellPool;
  protected activeCells: Map<string, HTMLElement> = new Map();
  protected usedKeys: Set<string> = new Set();

  constructor(config: GridConfig, mountPoint: HTMLElement, layout: PLayout) {
    super(config, mountPoint, layout);
    this.cellPool = new CellPool();
  }

  /**
   * Get or create a cell from the pool
   */
  protected acquireCell(key: string, container: HTMLElement): HTMLElement {
    this.usedKeys.add(key);
    let cell = this.activeCells.get(key);
    if (!cell) {
      cell = this.cellPool.acquire();
      this.activeCells.set(key, cell);
      container.appendChild(cell);
    }
    return cell;
  }

  /**
   * Begin a render cycle - reset used keys tracking
   */
  protected beginRender(): void {
    this.usedKeys.clear();
  }

  /**
   * End render cycle - release unused cells back to pool
   */
  protected endRender(container: HTMLElement): void {
    for (const [key, cell] of this.activeCells) {
      if (!this.usedKeys.has(key)) {
        container.removeChild(cell);
        this.cellPool.release(cell);
        this.activeCells.delete(key);
      }
    }
  }

  /**
   * Mark a key as used (for cells created by regions)
   */
  markKeyUsed(key: string): void {
    this.usedKeys.add(key);
  }

  /**
   * Register a cell created externally (by regions)
   */
  registerCell(key: string, cell: HTMLElement): void {
    this.usedKeys.add(key);
    this.activeCells.set(key, cell);
  }

  get poolSize(): number {
    return this.cellPool.size;
  }
}
