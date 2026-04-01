// flushSync is required because the grid's render pipeline measures cell dimensions
// (getBoundingClientRect) immediately after calling renderers — e.g. for column auto-sizing
// and sticky translateX on non-leaf column facets. Without flushSync, React's async batching
// means the DOM is empty at measurement time, producing wrong widths on the first frame.
import { createElement, type FC, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type { CellRenderer, RendererContext } from "grid/dist/renderer";
import type { FacetCellRenderer, FacetHeaderRenderer, FacetDataContext, FacetRendererContext, FacetHeaderContext } from "grid/dist/renderer";
import type { CellProps, FacetCellProps, FacetHeaderProps } from "./types";

export class ReactCellAdapter {
  #roots: Map<string, Root> = new Map();
  #contextWrapper: FC<{ children: ReactNode }> | undefined;

  constructor(contextWrapper?: FC<{ children: ReactNode }>) {
    this.#contextWrapper = contextWrapper;
  }

  createNativeDataCellRenderer(Component: FC<CellProps>): CellRenderer<any> {
    return (data: any, ctx: RendererContext) => {
      const key = ctx.key;
      let root = this.#roots.get(key);
      if (!root) {
        root = createRoot(ctx.container);
        this.#roots.set(key, root);
      }

      const element = createElement(Component, { value: data });
      const wrapped = this.#contextWrapper
        ? createElement(this.#contextWrapper, null, element)
        : element;

      flushSync(() => root.render(wrapped));
    };
  }

  createNativeFacetRenderer(Component: FC<FacetCellProps>): FacetCellRenderer {
    return (data: string, dataCtx: FacetDataContext, ctx: FacetRendererContext) => {
      const key = dataCtx.key;
      let root = this.#roots.get(key);
      if (!root) {
        root = createRoot(ctx.container);
        this.#roots.set(key, root);
      }

      const element = createElement(Component, {
        value: data,
        path: dataCtx.path,
        level: dataCtx.level,
        index: dataCtx.index,
      });
      const wrapped = this.#contextWrapper
        ? createElement(this.#contextWrapper, null, element)
        : element;

      flushSync(() => root.render(wrapped));
    };
  }

  createNativeHeaderRenderer(Component: FC<FacetHeaderProps>): FacetHeaderRenderer {
    return (text: string, ctx: FacetHeaderContext) => {
      const key = ctx.key;
      let root = this.#roots.get(key);
      if (!root) {
        root = createRoot(ctx.container);
        this.#roots.set(key, root);
      }

      const element = createElement(Component, {
        text,
        level: ctx.level,
      });
      const wrapped = this.#contextWrapper
        ? createElement(this.#contextWrapper, null, element)
        : element;

      flushSync(() => root.render(wrapped));
    };
  }

  handleCellRelease(key: string): void {
    const root = this.#roots.get(key);
    if (root) {
      root.unmount();
      this.#roots.delete(key);
    }
  }

  dispose(): void {
    for (const [, root] of this.#roots) {
      root.unmount();
    }
    this.#roots.clear();
  }
}
