import { GridConfig, CellPlacement, Viewport, RenderContext } from "./types";
import { ColumnSizes } from "./viewstate";
import { gridCss, gridShadowElsStyle } from "./grid-css.tmp";

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

export class GridRenderer {
  #config: GridConfig;
  #mountPoint: HTMLElement;
  #container: HTMLElement;
  #virtualPanelEl: HTMLElement;
  #gridClipEl: HTMLElement;
  #cellPool: CellPool;
  #activeCells: Map<string, HTMLElement> = new Map();
  #cellsToMeasure: Array<{ cell: HTMLElement; sizeKey: number }> = [];

  constructor(config: GridConfig, mountPoint: HTMLElement) {
    this.#config = config;
    this.#mountPoint = mountPoint;
    this.#cellPool = new CellPool();
    [this.#container, , this.#virtualPanelEl, this.#gridClipEl] = this.#attachShadowDom();
  }

  get container(): HTMLElement {
    return this.#container;
  }

  get mountPoint(): HTMLElement {
    return this.#mountPoint;
  }

  #attachShadowDom(): HTMLElement[] {
    const el = this.#mountPoint;
    el.attachShadow({ mode: "open" });
    el.style.overflow = "auto";
    (el.shadowRoot as ShadowRoot).innerHTML = `
      <style>
        ${gridShadowElsStyle}
      </style>
      <div class="virtual-panel"></div>
      <div class="grid-clip"><slot></slot></div>
    `;

    const style = document.createElement("style");
    style.innerHTML = gridCss;
    el.append(style);
    const con = document.createElement("div");
    con.className = "grid-content";
    el.appendChild(con);

    return [con, ...Array.from(el.shadowRoot!.children)] as HTMLElement[];
  }

  measureRowHeight(): number {
    const sample = document.createElement("div");
    sample.className = "cell";
    sample.style.visibility = "hidden";
    sample.textContent = "Mgy$123,456";
    this.#container.appendChild(sample);
    const rect = sample.getBoundingClientRect();
    const height = rect.height;
    this.#container.removeChild(sample);
    console.log(`>>> Measured row height: ${height}px`);
    return height;
  }

  updateVirtualPanel(vp: Viewport): void {
    this.#virtualPanelEl.style.width = `${vp.totalWidth}px`;
    this.#virtualPanelEl.style.height = `${vp.totalHeight}px`;
    this.#container.style.setProperty("--offset-x", `${vp.offsetX}px`);
    this.#container.style.setProperty("--offset-y", `${vp.offsetY}px`);
  }

  setGridTemplate(columns: string, rows: string): void {
    this.#container.style.gridTemplateColumns = columns;
    this.#container.style.gridTemplateRows = rows;
  }

  beginRender(): RenderContext {
    this.#cellsToMeasure.length = 0;
    const usedKeys = new Set<string>();
    return {
      usedKeys,
      placeCellInDom: (placement: CellPlacement) => this.#placeCellInDom(placement, usedKeys),
    };
  }

  #placeCellInDom(placement: CellPlacement, usedKeys: Set<string>): HTMLElement {
    usedKeys.add(placement.key);
    let cell = this.#activeCells.get(placement.key);
    if (!cell) {
      cell = this.#cellPool.acquire();
      this.#activeCells.set(placement.key, cell);
      this.#container.appendChild(cell);
    }

    cell.textContent = placement.content;
    cell.className = "cell " + placement.cls;
    cell.style.gridColumn = placement.colspan
      ? `${placement.gridCol} / span ${placement.colspan}`
      : `${placement.gridCol}`;
    cell.style.gridRow = placement.rowspan
      ? `${placement.gridRow} / span ${placement.rowspan}`
      : `${placement.gridRow}`;

    // Apply sticky positions
    if (placement.top !== undefined) {
      cell.style.top = `${placement.top}px`;
    }
    if (placement.left !== undefined) {
      cell.style.left = `${placement.left}px`;
    }
    if (placement.transform !== undefined) {
      cell.style.transform = placement.transform;
    }

    // Queue for measurement
    // Skip merged cells (colspan > 1): their visual width spans multiple columns
    const isMerged = placement.colspan && placement.colspan > 1;
    if (placement.sizeKey !== undefined && !isMerged) {
      this.#cellsToMeasure.push({ cell, sizeKey: placement.sizeKey });
    }

    return cell;
  }

  endRender(usedKeys: Set<string>): { poolSize: number } {
    // Remove unused cells
    for (const [key, cell] of this.#activeCells) {
      if (!usedKeys.has(key)) {
        this.#container.removeChild(cell);
        this.#cellPool.release(cell);
        this.#activeCells.delete(key);
      }
    }
    return { poolSize: this.#cellPool.size };
  }

  measureCells(columnSizes: ColumnSizes): void {
    if (this.#cellsToMeasure.length === 0) return;

    const indices: number[] = [];
    for (const { cell, sizeKey } of this.#cellsToMeasure) {
      const width = cell.getBoundingClientRect().width;
      if (!width) continue;
      if (width > (indices[sizeKey] || 0)) {
        indices[sizeKey] = width;
      }
    }
    for (let i = 0; i < indices.length; i++) {
      if (indices[i] === undefined) continue;
      columnSizes.indices[i] = indices[i];
    }
  }

  adjustStickyPositions(cells: HTMLElement[][], leftPositions: number[]): void {
    for (let i = 0; i < cells.length; i++) {
      const cellsAtLevel = cells[i];
      for (let j = 0; j < cellsAtLevel.length; j++) {
        const cell = cellsAtLevel[j];
        cell.style.left = `${leftPositions[i]}px`;
      }
    }
  }

  debugInfo(dt: number, renderCount: number, poolSize: number): void {
    const debugEl = document.getElementById("pref-info");
    if (!debugEl) return;
    debugEl.innerText = `[dT: ${dt.toFixed(2)}ms] [drawCalled = ${renderCount}] [els: ${document.getElementsByTagName("*").length}] [pool: ${poolSize}]`;
  }
}
