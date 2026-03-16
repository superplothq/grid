import {
  FlatTableConfig,
  GetRowsIR,
  GetRowsResponse,
  MeasureSchema,
  Schema,
  PageNode,
  ExpandedGroup,
} from "./types";
import { FlattenedDataViewModel, createRowMeta } from "../renderer/flattened-data-viewmodel";
import { GridDataViewModelOptions } from "../renderer/types";

const DEFAULT_PAGE_SIZE = 10000;
const DEFAULT_MAX_CACHE_SIZE = 20;

export function getUnfetchedPagesByLogicalBoundary(
  pages: PageNode[],
  logicalStart: number,
  logicalEnd: number,
): { selectPath: string[]; page: PageNode }[] {
  const pagesToFetch: { selectPath: string[]; page: PageNode }[] = [];
  let logicalRow = 0;
  let done = false;

  const walkPages = (currentPages: PageNode[], selectPath: string[]): void => {
    for (const page of currentPages) {
      if (done) return;
      if (page.data === null) {
        if (logicalRow + page.rowCount > logicalStart && logicalRow < logicalEnd) {
          pagesToFetch.push({ selectPath, page });
        }
        logicalRow += page.rowCount;
      } else {
        for (let rowIdx = 0; rowIdx < page.rowCount; rowIdx++) {
          if (logicalRow >= logicalEnd) { done = true; return; }
          logicalRow++;
          const expanded = page.expandedRows.get(rowIdx);
          if (expanded?.expanded) {
            const rowValue = String(page.data[0][rowIdx]);
            walkPages(expanded.pages, [...selectPath, rowValue]);
          }
        }
      }
    }
  };

  walkPages(pages, []);
  return pagesToFetch;
}

export abstract class FlatTableDataModel {
  config: FlatTableConfig;
  pages: PageNode[] = [];
  topLevelRowCount = 0;
  private lastIR: GetRowsIR | null = null;
  private viewModelOptions?: GridDataViewModelOptions;
  private schemaMap: Map<string, Schema | MeasureSchema>;

  constructor(config: FlatTableConfig) {
    // TODO[review] merge with default config
    this.config = config;
    this.schemaMap = new Map(config.schema.map((s) => [s.name, s]));
  }

  abstract getData(ir: GetRowsIR): Promise<GetRowsResponse>;

  get pageSize(): number {
    return this.config.pageSize ?? DEFAULT_PAGE_SIZE;
  }

  get maxCacheSize(): number {
    return this.config.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
  }

  setViewModelOptions(options: GridDataViewModelOptions): void {
    this.viewModelOptions = options;
  }

  setConfig(config: FlatTableConfig): void {
    this.config = config;
    this.schemaMap = new Map(config.schema.map((s) => [s.name, s]));
    this.pages = [];
    this.topLevelRowCount = 0;
  }

  async getViewModelData(ir: GetRowsIR): Promise<FlattenedDataViewModel> {
    if (this.lastIR) {
      // TODO[review] is object equality check enough. this seems heavy
      const groupByChanged = this.lastIR.groupBy.join(",") !== ir.groupBy.join(",");
      const filterChanged = JSON.stringify(this.lastIR.filter) !== JSON.stringify(ir.filter);
      const projectChanged = this.lastIR.project.join(",") !== ir.project.join(",");
      const sortChanged = JSON.stringify(this.lastIR.sort) !== JSON.stringify(ir.sort);
      if (groupByChanged || filterChanged || projectChanged || sortChanged) {
        this.pages = [];
        this.topLevelRowCount = 0;
      }
    }

    this.lastIR = ir;

    // resolveLogicalRange needs page slots to walk. Page slots need totalRowCount,
    // which only comes from a getData call. Bootstrap by fetching the first page.
    if (this.pages.length === 0) {
      const bootstrapIR: GetRowsIR = {
        ...ir,
        startRow: 0,
        endRow: this.pageSize,
        select: [],
      };
      const response = await this.getData(bootstrapIR);
      this.pages = this.createPageSlots(response.totalRowCount, this.pageSize);
      this.topLevelRowCount = response.totalRowCount;
      this.pages[0].data = response.rowData;
    }

    const pagesToFetch = getUnfetchedPagesByLogicalBoundary(this.pages, ir.startRow, ir.endRow);

    await Promise.all(pagesToFetch.map(async (req) => {
      const fetchIR: GetRowsIR = {
        ...ir,
        select: req.selectPath,
        startRow: req.page.physicalStart,
        endRow: req.page.physicalStart + req.page.rowCount,
      };
      const response = await this.getData(fetchIR);
      req.page.data = response.rowData;
    }));

    this.evictIfNeeded();
    return this.flatten();
  }

  // TODO when expand happens the IR is not updated, hence the IR does not know the upto date startRow
  //      Example: scroll down to load more page, scroll back up and then expand, IR would have the
  //      startRow from last page load when it was at the very bottom of the page (no idea about scroll back up)
  //      Pass the startRow as parameter
  //      this might have an error for page eviction
  async expand(select: string[]): Promise<FlattenedDataViewModel> {
    const result = this.findGroupRow(select);
    if (!result) {
      throw new Error(`Group row not found for select: ${select.join(", ")}`);
    }

    const { page, localRowIndex } = result;
    const existing = page.expandedRows.get(localRowIndex);

    // collapse() only sets expanded=false, pages/data are retained in cache.
    // Re-expanding is a cache hit — no getData call needed.
    if (existing && !existing.expanded) {
      existing.expanded = true;
      return this.flatten();
    }

    const ir = this.lastIR!;
    const childGroupBy = ir.groupBy.slice(select.length);
    const hasOutsideFacetDims = this.hasOutsideFacetDims();
    const isLeafFacet = childGroupBy.length === 0;

    if (isLeafFacet && !hasOutsideFacetDims) {
      throw new Error("Cannot expand a leaf row with no outside facet dimensions");
    }

    const childIR: GetRowsIR = {
      startRow: 0,
      endRow: this.pageSize,
      select,
      groupBy: ir.groupBy,
      project: ir.project,
      sort: ir.sort,
      filter: ir.filter,
    };

    const response = await this.getData(childIR);
    const childPages = this.createPageSlots(response.totalRowCount, this.pageSize);
    childPages[0].data = response.rowData;

    const group: ExpandedGroup = {
      expanded: true,
      totalRowCount: response.totalRowCount,
      pages: childPages,
    };
    page.expandedRows.set(localRowIndex, group);

    this.evictIfNeeded();
    return this.flatten();
  }

  async collapse(select: string[]): Promise<FlattenedDataViewModel> {
    const result = this.findGroupRow(select);
    if (!result) {
      throw new Error(`Group row not found for select: ${select.join(", ")}`);
    }

    const { page, localRowIndex } = result;
    const existing = page.expandedRows.get(localRowIndex);
    if (existing) {
      existing.expanded = false;
    }

    return this.flatten();
  }

  private hasOutsideFacetDims(): boolean {
    const ir = this.lastIR!;
    const groupBySet = new Set(ir.groupBy);
    return ir.project.some((col) => {
      const def = this.schemaMap.get(col);
      return def && def.type === "dimension" && !groupBySet.has(col);
    });
  }

  createPageSlots(totalRowCount: number, pageSize: number): PageNode[] {
    const numSlots = Math.ceil(totalRowCount / pageSize);
    const slots: PageNode[] = [];
    for (let i = 0; i < numSlots; i++) {
      slots.push({
        data: null,
        physicalStart: i * pageSize,
        rowCount: Math.min(pageSize, totalRowCount - i * pageSize),
        expandedRows: new Map(),
      });
    }
    return slots;
  }

  findGroupRow(select: string[]): { page: PageNode; localRowIndex: number } | null {
    if (select.length === 0) return null;

    let currentPages = this.pages;

    for (let i = 0; i < select.length; i++) {
      const value = select[i];
      const isLast = i === select.length - 1;

      let found = false;
      for (const page of currentPages) {
        if (!page.data) continue;
        for (let rowIdx = 0; rowIdx < page.rowCount; rowIdx++) {
          if (String(page.data[0][rowIdx]) === String(value)) {
            if (isLast) {
              return { page, localRowIndex: rowIdx };
            }
            const expanded = page.expandedRows.get(rowIdx);
            if (!expanded) return null;
            currentPages = expanded.pages;
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (!found) return null;
    }

    return null;
  }

  private flatten(): FlattenedDataViewModel {
    const ir = this.lastIR!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[][] = ir.project.map(() => []);
    const rowFacet: (string | null)[] = [];
    const rowMetaBytes: number[] = [];
    // offsetTop tracks logical rows before the contiguous block (for future viewmodel support)
    let offsetTop = 0; // eslint-disable-line @typescript-eslint/no-unused-vars, no-unused-vars
    const hasOutsideFacetDims = this.hasOutsideFacetDims();

    const columnDefs = ir.project.map((col) => this.schemaMap.get(col)!);

    const findContiguousBlock = (pages: PageNode[], targetSlotIndex: number): { blockStart: number; blockEnd: number } => {
      if (pages.length === 0 || !pages[targetSlotIndex]?.data) {
        return { blockStart: 0, blockEnd: -1 };
      }

      let blockStart = targetSlotIndex;
      while (blockStart > 0 && pages[blockStart - 1].data !== null) {
        blockStart--;
      }

      let blockEnd = targetSlotIndex;
      while (blockEnd < pages.length - 1 && pages[blockEnd + 1].data !== null) {
        blockEnd++;
      }

      return { blockStart, blockEnd };
    };

    const walkPages = (pages: PageNode[], depth: number, targetSlotIndex: number): void => {
      if (pages.length === 0) return;

      const isFacetLevel = depth < ir.groupBy.length;
      const groupFieldProject = isFacetLevel ? this.buildProjectForDepth(depth) : null;

      const { blockStart, blockEnd } = findContiguousBlock(pages, targetSlotIndex);
      if (blockEnd < blockStart) return;

      for (let i = 0; i < blockStart; i++) {
        let pageLogicalRows = pages[i].rowCount;
        for (const [, expanded] of pages[i].expandedRows) {
          if (expanded.expanded) {
            pageLogicalRows += this.computeForLevel(expanded.pages, expanded.totalRowCount);
          }
        }
        offsetTop += pageLogicalRows;
      }

      for (let i = blockStart; i <= blockEnd; i++) {
        const page = pages[i];

        for (let rowIdx = 0; rowIdx < page.rowCount; rowIdx++) {
          const expanded = page.expandedRows.get(rowIdx);
          const isExpanded = expanded?.expanded === true;

          if (isFacetLevel) {
            // Column 0 is always the group field. Each facet level groups by exactly one field
            // (groupBy[depth]) because expanding a row creates nested PageNodes in expandedRows,
            // where each child level holds its own data from a separate query. Parent group fields
            // are consumed as WHERE filters via select path, not included in the child's SELECT.
            //
            // groupBy:["country","year"]:
            //   depth 0: this.pages → SELECT "country", SUM("gold")... GROUP BY "country"
            //            → data[0] = ["USA","Canada"]
            //   depth 1: expandedRows[USA].pages → SELECT "year", SUM("gold")... WHERE country='USA' GROUP BY "year"
            //            → data[0] = ["2008","2012"]
            rowFacet.push(page.data![0][rowIdx]);

            // Deepest facet level is only leaf when there are no outsideFacetDim rows below it.
            // With outsideFacetDims, the facet row is expandable into individual data rows.
            //
            // groupBy:[country,year], project:[athlete,gold] (hasOutsideFacetDims=true):
            //   country (depth 0, isLeaf=false)
            //     year (depth 1, isLeaf=false) ← expandable into athlete rows
            //       athlete row (depth 2, isLeaf=true)
            //
            // groupBy:[country,year], project:[gold,silver] (hasOutsideFacetDims=false):
            //   country (depth 0, isLeaf=false)
            //     year (depth 1, isLeaf=true) ← nothing below
            const isLeaf = (depth === ir.groupBy.length - 1) && !hasOutsideFacetDims;
            rowMetaBytes.push(createRowMeta(depth, isLeaf, isExpanded));

            for (let colIdx = 0; colIdx < ir.project.length; colIdx++) {
              const colDef = columnDefs[colIdx];
              if (colDef.type === "measure") {
                const projIdx = groupFieldProject!.indexOf(ir.project[colIdx]);
                data[colIdx].push(page.data![projIdx][rowIdx]);
              } else {
                data[colIdx].push(null);
              }
            }

            if (isExpanded && expanded) {
              walkPages(expanded.pages, depth + 1, 0);
            }
          } else {
            rowFacet.push(null);
            rowMetaBytes.push(createRowMeta(depth, true, false));

            for (let colIdx = 0; colIdx < ir.project.length; colIdx++) {
              data[colIdx].push(page.data![colIdx][rowIdx]);
            }
          }
        }
      }
    };

    const targetSlotIndex = this.findTargetSlotForLogicalStart(ir.startRow);
    walkPages(this.pages, 0, targetSlotIndex);

    this.computeTotalLogicalRows();
    const rowMeta = new Uint8Array(rowMetaBytes);

    const columnFacets: (string | null)[][] = [ir.project.map((col) => {
      const def = this.schemaMap.get(col);
      return def?.displayName ?? col;
    })];

    return new FlattenedDataViewModel(data, columnFacets, rowFacet, rowMeta, this.viewModelOptions);
  }

  private buildProjectForDepth(depth: number): string[] {
    const ir = this.lastIR!;
    const groupField = ir.groupBy[depth];
    const measureCols: string[] = [];
    for (const [name, def] of this.schemaMap) {
      if ((def as MeasureSchema).aggregateFn) measureCols.push(name);
    }
    return [groupField, ...measureCols];
  }

  computeTotalLogicalRows(): number {
    return this.computeForLevel(this.pages, this.topLevelRowCount);
  }

  private computeForLevel(pages: PageNode[], totalAtThisLevel: number): number {
    let count = totalAtThisLevel;

    for (const page of pages) {
      for (const [, expandedGroup] of page.expandedRows) {
        if (expandedGroup.expanded) {
          count += this.computeForLevel(expandedGroup.pages, expandedGroup.totalRowCount);
        }
      }
    }

    return count;
  }

  private countFetchedPages(): number {
    return this.countFetchedPagesInTree(this.pages);
  }

  private countFetchedPagesInTree(pages: PageNode[]): number {
    let count = 0;
    for (const page of pages) {
      if (page.data !== null) count++;
      for (const [, expanded] of page.expandedRows) {
        count += this.countFetchedPagesInTree(expanded.pages);
      }
    }
    return count;
  }

  private evictIfNeeded(): void {
    while (this.countFetchedPages() > this.maxCacheSize) {
      const farthest = this.findFarthestPage();
      if (!farthest) break;
      this.evictPage(farthest);
    }
  }

  private findFarthestPage(): PageNode | null {
    const targetSlot = this.lastIR ? Math.floor(this.lastIR.startRow / this.pageSize) : 0;
    let farthest: PageNode | null = null;
    let maxDist = -1;

    const walk = (pages: PageNode[], baseOffset: number): void => {
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (page.data !== null) {
          const dist = Math.abs(baseOffset + i - targetSlot);
          if (dist > maxDist) {
            maxDist = dist;
            farthest = page;
          }
        }
        for (const [idx, expanded] of page.expandedRows) {
          walk(expanded.pages, baseOffset + page.physicalStart + idx);
        }
      }
    };

    walk(this.pages, 0);
    return farthest;
  }

  private evictPage(page: PageNode): void {
    page.data = null;
    for (const [, expanded] of page.expandedRows) {
      for (const childPage of expanded.pages) {
        this.evictPage(childPage);
      }
    }
  }

  private findTargetSlotForLogicalStart(logicalStart: number): number {
    let logicalRow = 0;
    for (let i = 0; i < this.pages.length; i++) {
      const page = this.pages[i];
      let pageLogicalRows = page.rowCount;
      for (const [, expanded] of page.expandedRows) {
        if (expanded.expanded) {
          pageLogicalRows += this.computeForLevel(expanded.pages, expanded.totalRowCount);
        }
      }
      if (logicalRow + pageLogicalRows > logicalStart) {
        return i;
      }
      logicalRow += pageLogicalRows;
    }
    return Math.max(0, this.pages.length - 1);
  }
}
