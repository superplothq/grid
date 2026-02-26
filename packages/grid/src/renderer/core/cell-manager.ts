export default class CellManager {
  #pool: HTMLElement[] = [];
  #activeCells: Map<string, HTMLElement> = new Map();
  #usedKeys: Set<string> = new Set();

  beginFrame(): void {
    this.#usedKeys.clear();
  }

  acquire(key: string): [HTMLElement, doesNodeRequireAppend: boolean] {
    this.#usedKeys.add(key);
    let cell = this.#activeCells.get(key);
    if (cell) return [cell, false];

    if (this.#pool.length > 0) {
      cell = this.#pool.pop()!;
    } else {
      cell = document.createElement("div");
      cell.className = "cell";
    }
    this.#activeCells.set(key, cell);

    return [cell, true];
  }

  endFrame(): HTMLElement[] {
    const toRemove: HTMLElement[] = [];

    for (const [key, cell] of this.#activeCells) {
      if (!this.#usedKeys.has(key)) {
        toRemove.push(cell);
        this.#release(cell);
        this.#activeCells.delete(key);
      }
    }

    return toRemove;
  }

  #release(cell: HTMLElement): void {
    cell.className = "cell";
    cell.style.cssText = "";
    cell.innerHTML = "";
    delete cell.dataset.cclix;
    delete cell.dataset.croix;
    delete cell.dataset.cellType;
    delete cell.dataset.hix;
    delete cell.dataset.facetLevel;
    this.#pool.push(cell);
  }

  get poolSize(): number {
    return this.#pool.length;
  }

  get activeCount(): number {
    return this.#activeCells.size;
  }
}
