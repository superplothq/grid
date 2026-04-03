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
  #pendingRenders: (() => void)[] = [];

  constructor(contextWrapper?: FC<{ children: ReactNode }>) {
    this.#contextWrapper = contextWrapper;
  }

  #wrap(element: ReturnType<typeof createElement>): ReturnType<typeof createElement> {
    return this.#contextWrapper
      ? createElement(this.#contextWrapper, null, element)
      : element;
  }

  #getOrCreateRoot(key: string, container: HTMLElement): Root {
    let root = this.#roots.get(key);
    if (!root) {
      root = createRoot(container);
      this.#roots.set(key, root);
    }
    return root;
  }

  createNativeDataCellRenderer(Component: FC<CellProps>): CellRenderer<any> {
    return (data: any, ctx: RendererContext) => {
      const root = this.#getOrCreateRoot(ctx.key, ctx.container);
      const wrapped = this.#wrap(createElement(Component, { value: data, cell: ctx.container }));
      this.#pendingRenders.push(() => root.render(wrapped));
    };
  }

  createNativeFacetRenderer(Component: FC<FacetCellProps>): FacetCellRenderer {
    return (data: string, dataCtx: FacetDataContext, ctx: FacetRendererContext) => {
      const root = this.#getOrCreateRoot(dataCtx.key, ctx.container);
      const wrapped = this.#wrap(createElement(Component, {
        value: data,
        path: dataCtx.path,
        level: dataCtx.level,
        index: dataCtx.index,
        cell: ctx.cell,
        container: ctx.container,
        viewModel: dataCtx.viewModel,
        render: ctx.render,
        // TODO: this is mandatory for flattened-data-viewmodel
        //       Since for flattened data and pivot data only one FacetCellProps is the only
        //       interface that's carry the information for now it's passed as optional argument
        ...(dataCtx.flatMeta && { flatMeta: dataCtx.flatMeta }),
      }));
      this.#pendingRenders.push(() => root.render(wrapped));
    };
  }

  createNativeHeaderRenderer(Component: FC<FacetHeaderProps>): FacetHeaderRenderer {
    return (text: string, ctx: FacetHeaderContext) => {
      const root = this.#getOrCreateRoot(ctx.key, ctx.container);
      const wrapped = this.#wrap(createElement(Component, { text, level: ctx.level }));
      this.#pendingRenders.push(() => root.render(wrapped));
    };
  }

  flush(): void {
    if (this.#pendingRenders.length === 0) return;
    const batch = this.#pendingRenders;
    this.#pendingRenders = [];
    flushSync(() => {
      for (const render of batch) render();
    });
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
