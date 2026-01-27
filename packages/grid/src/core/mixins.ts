import CellManager from "./cell-manager";

export interface PlaceCellOpts {
  key: string;
  content: string;
  cls: string;
  gridRow: number;
  gridCol: number;
  extraStyles: {
    colspan?: number;
    rowspan?: number;
    top?: number;
    bottom?: number;
    left?: number;
    transform?: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = object> = abstract new (...args: any[]) => T;

interface HasCellManager {
  cellManager: CellManager;
}

export function WithCellPlacement<TBase extends Constructor<HasCellManager>>(Base: TBase) {
  abstract class Mixed extends Base {
    placeCellInDom(opts: PlaceCellOpts): [HTMLElement, boolean] {
      const [cell, needAppend] = this.cellManager.acquire(opts.key);

      cell.textContent = opts.content;
      cell.className = "cell " + opts.cls;
      cell.style.gridColumn = opts.extraStyles.colspan
        ? `${opts.gridCol} / span ${opts.extraStyles.colspan}`
        : `${opts.gridCol}`;
      cell.style.gridRow = opts.extraStyles.rowspan
        ? `${opts.gridRow} / span ${opts.extraStyles.rowspan}`
        : `${opts.gridRow}`;

      if (opts.extraStyles.top !== undefined) cell.style.top = `${opts.extraStyles.top}px`;
      if (opts.extraStyles.bottom !== undefined) cell.style.bottom = `${opts.extraStyles.bottom}px`;
      if (opts.extraStyles.left !== undefined) cell.style.left = `${opts.extraStyles.left}px`;
      if (opts.extraStyles.transform !== undefined) cell.style.transform = opts.extraStyles.transform;

      return [cell, needAppend];
    }
  }
  return Mixed;
}
