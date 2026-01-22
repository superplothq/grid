import { GridConfig, defaultConfig } from "./types";
import { GridDataViewModel } from "./grid-data-viewmodel";
import { ViewState } from "./viewstate";
import { GridRenderer } from "./view";
import { LayoutRenderer } from "./core/layout-renderer";
import { RegionRenderer } from "./core/region-renderer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComponentClass = new (...args: any[]) => any;

function addToMap(
  map: Map<string, Map<string, ComponentClass>>,
  type: string,
  name: string,
  cls: ComponentClass
): void {
  if (!map.has(type)) {
    map.set(type, new Map());
  }
  map.get(type)!.set(name, cls);
}

// Class-level registry (shared defaults) - module scope to avoid private field collision
const staticRegistry: Map<string, Map<string, ComponentClass>> = new Map();

export class Grid {
  // Instance-level registry (per-grid overrides)
  #instanceRegistry: Map<string, Map<string, ComponentClass>> = new Map();

  #config: GridConfig;
  #data: GridDataViewModel | undefined;
  #viewState: ViewState;
  #view: GridRenderer;
  #scrollRAF: number | null = null;
  #scrollListenerSet = false;
  #renderCount = 0;
  #layoutBootstrapped = false;
  #postRenderAdjustCellsPerLevel: HTMLElement[][] = [];

  static register(type: string, name: string, cls: ComponentClass): void {
    addToMap(staticRegistry, type, name, cls);
  }

  register(type: string, name: string, cls: ComponentClass): void {
    addToMap(this.#instanceRegistry, type, name, cls);
  }

  getComponent(type: string, name: string): ComponentClass | undefined {
    return this.#instanceRegistry.get(type)?.get(name) ??
      staticRegistry.get(type)?.get(name);
  }

  constructor(config: Partial<GridConfig>, mountPoint: HTMLElement) {
    this.#config = { ...defaultConfig, ...config };
    this.#viewState = new ViewState(this.#config);
    this.#view = new GridRenderer(this.#config, mountPoint);
    this.#viewState.columnSizes.rowHeight = this.#view.measureRowHeight();
  }

  set data(value: GridDataViewModel) {
    this.#data = value;
  }

  get data(): GridDataViewModel | undefined {
    return this.#data;
  }

  #setupScrollListener(): void {
    if (this.#scrollListenerSet) return;
    this.#view.mountPoint.addEventListener("scroll", () => {
      this.#scrollListenerSet = true;
      if (this.#scrollRAF) return;

      this.#scrollRAF = requestAnimationFrame(() => {
        this.#scrollRAF = null;
        this.draw();
      });
    });
  }

  draw(): void {
    const startTime = performance.now();
    this.#renderCount++;

    if (!this.#data) throw new Error("Data is not set!");

    // 1. Update view state from data
    this.#viewState.updateMeta(this.#data);

    // 2. Compute viewport
    const vp = this.#viewState.computeViewport(
      this.#view.mountPoint.scrollTop,
      this.#view.mountPoint.scrollLeft,
      this.#view.mountPoint.clientWidth,
      this.#view.mountPoint.clientHeight,
      this.#data
    );

    // 3. Update virtual panel
    this.#view.updateVirtualPanel(vp);

    // 4. Fetch visible data slice
    const slice = this.#data.getSlice(vp.x0, vp.y0, vp.x1, vp.y1);

    // 5. Get layout from LayoutRenderer
    const LayoutCls = this.getComponent("layout", "pivot");
    if (!LayoutCls) {
      throw new Error("No layout renderer registered for 'pivot'");
    }
    const layout = new LayoutCls() as LayoutRenderer;
    const gridLayout = layout.computeLayout(this.#viewState, vp, this.#data, this.#config);

    // 6. Set grid template
    const template = layout.getGridTemplate(
      this.#data.rowFacetCount,
      this.#data.colFacetCount,
      vp.x1 - vp.x0,
      vp.y1 - vp.y0,
      vp.rowHeight
    );
    this.#view.setGridTemplate(template.columns, template.rows);

    // 7. Begin render cycle
    const ctx = this.#view.beginRender();

    // Reset post-render adjustment tracking
    for (let i = 0; i < this.#data.rowFacetCount; i++) {
      this.#postRenderAdjustCellsPerLevel.push([]);
    }

    // 8. Render each region
    for (const region of gridLayout.regions) {
      const regionType = this.#mapRegionType(region.type);
      const RegionCls = this.getComponent("region", regionType);
      if (RegionCls) {
        const renderer = new RegionCls() as RegionRenderer;
        const renderedCells = renderer.render(
          region,
          this.#view,
          this.#viewState,
          slice,
          vp,
          this.#config,
          ctx
        );
        // Track cells for post-render adjustment (row facets and corners)
        if (region.type === "rowFacet" || region.type === "corner") {
          this.#trackCellsForAdjustment(renderedCells, region.type);
        }
      }
    }

    // 9. End render cycle (cleanup unused cells)
    const stats = this.#view.endRender(ctx.usedKeys);

    // 10. Measure and update column sizes
    this.#view.measureCells(this.#viewState.columnSizes);

    // 11. Setup scroll listener
    this.#setupScrollListener();

    // 12. Bootstrap adjustments on first render
    if (!this.#layoutBootstrapped) {
      this.#layoutBootstrapped = true;
      this.#onLayoutBootstrap();
    }

    // Cleanup
    this.#postRenderAdjustCellsPerLevel.length = 0;

    // 13. Debug info
    this.#view.debugInfo(performance.now() - startTime, this.#renderCount, stats.poolSize);
  }

  #mapRegionType(type: string): string {
    const mapping: Record<string, string> = {
      corner: "corner",
      rowFacet: "row-facet",
      colFacet: "col-facet",
      values: "value",
    };
    return mapping[type] || type;
  }

  #trackCellsForAdjustment(cells: HTMLElement[], regionType: string): void {
    // This is a simplified tracking - in full implementation,
    // cells would be tracked per level
    if (cells.length > 0 && this.#postRenderAdjustCellsPerLevel.length > 0) {
      // For now, just add to first level - region renderers will handle properly
    }
  }

  #onLayoutBootstrap(): void {
    const vp = this.#viewState.computeViewport(
      this.#view.mountPoint.scrollTop,
      this.#view.mountPoint.scrollLeft,
      this.#view.mountPoint.clientWidth,
      this.#view.mountPoint.clientHeight,
      this.#data!
    );
    this.#view.updateVirtualPanel(vp);
    const { rowFacetsLeftPositions } = this.#viewState.getFacetPositions(
      vp.rowHeight,
      this.#data!
    );
    this.#view.adjustStickyPositions(
      this.#postRenderAdjustCellsPerLevel,
      rowFacetsLeftPositions
    );
  }
}
