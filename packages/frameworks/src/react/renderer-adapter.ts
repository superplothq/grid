import { createElement, type FC, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CellRenderer, RendererContext } from "grid/dist/renderer";
import type { CellProps } from "./types";

interface RootEntry {
  root: Root;
  container: HTMLElement;
}

export class ReactCellAdapter {
  #roots: Map<string, RootEntry> = new Map();
  #contextWrapper: FC<{ children: ReactNode }> | undefined;

  constructor(contextWrapper?: FC<{ children: ReactNode }>) {
    this.#contextWrapper = contextWrapper;
  }

  createNativeRenderer(Component: FC<CellProps>): CellRenderer<any> {
    return (data: any, ctx: RendererContext) => {
      const key = ctx.key;
      let entry = this.#roots.get(key);
      if (!entry) {
        const container = document.createElement("div");
        container.style.display = "contents";
        const root = createRoot(container);
        entry = { root, container };
        this.#roots.set(key, entry);
      }

      const parts = key.split("-");
      const colIndex = parseInt(parts[1], 10);
      const rowIndex = parseInt(parts[2], 10);

      const element = createElement(Component, { value: data, rowIndex, colIndex });
      const wrapped = this.#contextWrapper
        ? createElement(this.#contextWrapper, null, element)
        : element;

      entry.root.render(wrapped);
      return entry.container;
    };
  }

  handleCellRelease(key: string): void {
    const entry = this.#roots.get(key);
    if (entry) {
      entry.root.unmount();
      this.#roots.delete(key);
    }
  }

  dispose(): void {
    for (const [, entry] of this.#roots) {
      entry.root.unmount();
    }
    this.#roots.clear();
  }
}
