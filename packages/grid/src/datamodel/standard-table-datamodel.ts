import {
  DataSchema,
  ColumnRangeValues,
  StandardTableConfig,
  StandardDataFetchAndTransformIR,
  GetRowsResponse,
  PageNode,
  ExpandedGroup,
  StandardMetadataResolver,
  StandardMetadataPlumber,
  StandardMetadataPlumbing,
  StandardColumnMetadata,
  StandardMetadataResolverInput,
  StandardGlobalMetadataResolver,
  StandardRawMetadata,
  PageMetadata,
} from "./types";
import { DataModel } from "./datamodel";
import { outputColumnsForDepth } from "./utils";
import { FlattenedDataViewModelParams, createRowMeta } from "../renderer/flattened-data-viewmodel";
import { GridDataViewModelOptions, ViewModelMetadata, ValueRowMetadata, ValueCellMetadata } from "../renderer/types";

const defaultConfig: StandardTableConfig = {
  pageSize: 10000,
  maxNumPageBeforeEviction: 300,
};

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
        // check if the page is in the range
        if (logicalRow + page.rowCount > logicalStart && logicalRow < logicalEnd) {
          pagesToFetch.push({ selectPath, page });
        }
        logicalRow += page.rowCount;
      } else {
        for (let rowIdx = 0; rowIdx < page.rowCount; rowIdx++) {
          // page doesn't end before the range starts && page doesn't start after the range ends
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


// counts the total number of visible logical rows within a page tree level
// Example: Say level 0 has 30 group rows (totalAtThisLevel = 30). If data00 is expanded and has
// 30 children, and data01 is also expanded with 30 children, the function returns 30 + 30 + 30 =
// 90. If one of those children is further expanded with 20 leaf rows, it becomes 30 + 30 + (30 +
// 20) = 110.
function computeForLevel(pages: PageNode[], totalAtThisLevel: number): number {
  let count = totalAtThisLevel;
  for (const page of pages) {
    for (const [, expandedGroup] of page.expandedRows) {
      if (expandedGroup.expanded) {
        count += computeForLevel(expandedGroup.pages, expandedGroup.totalRowCount);
      }
    }
  }
  return count;
}

type TargetSlotPath = Array<{ pageIdx: number; rowIdx: number }>;
export function findTargetSlotPath(
  pages: PageNode[],
  logicalStart: number,
  path: TargetSlotPath = []): TargetSlotPath {
  let rowsTraversedSoFar = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!page.data) {
      rowsTraversedSoFar += page.rowCount;
      continue;
    }
    const ownRows = page.rowCount;
    let numChildRowsNested = 0;
    let rowIndexToNestedCount = new Array(page.rowCount);
    // let rowIndexToNestedCount = new Array(page.data!.length);
    for (const [rowIdx, expanded] of page.expandedRows) {
      if (!expanded.expanded) continue;
      const val = computeForLevel(expanded.pages, expanded.totalRowCount);
      rowIndexToNestedCount[rowIdx] = val;
      numChildRowsNested += val;
    }
    const totalPageRowsIncludingNested = ownRows + numChildRowsNested;

    const pathEntry = { pageIdx: i, rowIdx: -1 };
    if (rowsTraversedSoFar + totalPageRowsIncludingNested > logicalStart) {
      path.push(pathEntry);
      let cursor = rowsTraversedSoFar;
      for (let rowIdx = 0; rowIdx < page.rowCount; rowIdx++) {
        cursor++;
        const exp = page.expandedRows.get(rowIdx);
        if (!(exp && exp.expanded)) continue;
        // logicalStart lands exactly on this expanded row (not inside its children).
        // Point to its first child page so findContiguousPageBlocks searches from the
        // correct DFS position — otherwise it would start from the parent page and walk
        // through earlier rows' (potentially unloaded) children before reaching this row.
        // p0 (expanded via expand all)
        //   p0.0 <- loaded
        //   p0.1 <- unloaded
        //   p0.2 <- unloaded
        // p1 <--------- startIr
        //  p1.0 <- loaded
        //  p1.1 <- loaded
        if (logicalStart === cursor - 1) {
          pathEntry.rowIdx = rowIdx;
          path.push({ pageIdx: 0, rowIdx: -1 });
          return path;
        }
        if (logicalStart >= cursor && logicalStart < cursor + rowIndexToNestedCount[rowIdx]) {
          pathEntry.rowIdx = rowIdx;
          return findTargetSlotPath(exp.pages, logicalStart - cursor, path);
        }
        cursor += rowIndexToNestedCount[rowIdx];
      }
      return path;
    }
    rowsTraversedSoFar += totalPageRowsIncludingNested;
  }
  return path;
}

/*
  From the cursor position of pages, if traverse upwards and downwards to find contigous blocks
  of data that are loaded. This traversal is depth aware. 

  p0
    p0.0
    p0.1
    p0.2
  p1
    p1.0        <- {x}
    p1.1        [i]
      p1.1.0    [i]
      p1.1.1    [i]
  p2            [i]
    p2.0        [i]
    p2.1        <- cursor
  p3            [i]
    p3.0        [i]
      p3.0.0    [i]
      p3.0.1    <- {x}

  Legend:
    {x} -> not loaded
    [i] -> included

  Algorithm:
    Since number of pages is small, as page size tends to be large hence small number of pages (100s or 1000s)
    we can flatten the tree structure to make findContiguousPageBlocks simplier to implement and reason about.

    Conceptually this flattening is hard to imagine, as multiple rows in a page can be expanded 
    Since we are laying out the pages in flat structure, it wouldn't make sense intuitively
    For example, in the above case: let's say p0 and p1 is in the same page. When we flatten the tree
    page1    // contains: [p0, p1]
    page1.1  // contains: [p0.0, p0.1]
    page1.2  // contains: [p0.2]
    page2    // contains: [p2, p3]

    but it'll work, because we are not extracting data at this point, we are trying to find out the 
    contiguous blocks of data that are loaded. And it's a gurantee that if the child pages are expanded
    parent will always be loaded.

    So here is the flatenning algorithm:
      1. start = first page
      2. flatPages.push({ start, path, depth, parentRowIdx })
      3. if first page is expanded, iterate each child page in order and push it to flat pages
      4. do 2-3 recursively until we run out of pages
      4. in array store, path, depth, parentRowIdx (for which parent row the current childrens are expanded;
         -1 for top level and leafs)
        from original pages tree along side page.

    Once the flat tree is built, we can easily find out contiguous blocks of data that are loaded.
      1. find page by cursor from the flatPages array. Since flatPages contains the path,
         we can do a linear scan to find the page by path
      2. walk upwards until an unloaded page is found
      3. walk downwards until an unloaded page is found
      4. Return path for top boyndary and bottom boundary 
  */
export function findContiguousPageBlocks(pages: PageNode[], cursor: TargetSlotPath): {
  blockStart: TargetSlotPath;
  blockEnd: TargetSlotPath;
} {
  interface FlatEntry {
    page: PageNode;
    path: TargetSlotPath;
  }

  const toKey = (path: TargetSlotPath) => path.map((e) => `${e.pageIdx}:${e.rowIdx}`).join(".");

  const flatPages: FlatEntry[] = [];

  const flatten = (currentPages: PageNode[], pathPrefix: TargetSlotPath): void => {
    for (let i = 0; i < currentPages.length; i++) {
      const page = currentPages[i];
      const path: TargetSlotPath = [...pathPrefix, { pageIdx: i, rowIdx: -1 }];
      flatPages.push({ page, path });
      const sortedRowIds = [...page.expandedRows.keys()].sort((a, b) => a - b);
      for (const rowIdx of sortedRowIds) {
        const expanded = page.expandedRows.get(rowIdx)!;
        if (!expanded.expanded) continue;
        const childPrefix: TargetSlotPath = [...pathPrefix, { pageIdx: i, rowIdx }];
        flatten(expanded.pages, childPrefix);
      }
    }
  };

  flatten(pages, []);

  const cursorKey = toKey(cursor);
  let cursorIdx = flatPages.findIndex((entry) => toKey(entry.path) === cursorKey);

  if (cursorIdx === -1) {
    return { blockStart: cursor, blockEnd: cursor };
  }

  let startIdx = cursorIdx;
  while (startIdx > 0 && flatPages[startIdx - 1].page.data !== null) {
    startIdx--;
  }

  let endIdx = cursorIdx;
  while (endIdx < flatPages.length - 1 && flatPages[endIdx + 1].page.data !== null) {
    endIdx++;
  }

  return { blockStart: flatPages[startIdx].path, blockEnd: flatPages[endIdx].path };
}

export abstract class StandardTableDataModel extends DataModel<StandardDataFetchAndTransformIR, FlattenedDataViewModelParams> {
  /**
   * Resolved configuration after merging user-provided values with defaults. See [`StandardTableConfig`](/docs/api-references/type-references#standardtableconfig).
   */
  config: StandardTableConfig;
  /**
   * The page cache tree. Each [`PageNode`](/docs/api-references/type-references#pagenode) holds a fixed slice of rows; `data` is `null` until fetched and populated on demand as the user scrolls. When `groupBy` is active, expanding a group row creates a nested subtree of child pages under that row's `expandedRows` entry - so the cache forms a tree mirroring the group hierarchy. Collapsing hides children but keeps them cached. Pages are evicted (furthest from the current scroll position first) when the total fetched page count exceeds `maxNumPageBeforeEviction`.
   */
  pages: PageNode[] = [];
  topLevelRowCount = 0;
  #lastIR: StandardDataFetchAndTransformIR | null = null;
  #viewModelOptions?: GridDataViewModelOptions;
  #metadataPlumber?: StandardMetadataPlumber;
  columnMetadata?: StandardColumnMetadata[];

  constructor(schema: DataSchema[], config: Partial<StandardTableConfig> = {}, metadataPlumber?: StandardMetadataPlumber) {
    super(schema);
    this.config = { ...defaultConfig, ...config };
    this.#metadataPlumber = metadataPlumber;
  }

  /**
   * Subclasses must implement this to fetch rows from the data source. The [`StandardDataFetchAndTransformIR`](/docs/api-references/type-references#getrowsir) (intermediate representation) drives data fetching and transformation at the source - the subclass converts it into a command for its backend. For example, `SqlStandardTableDataModel` generates SQL from the IR. Returns a [`GetRowsResponse`](/docs/api-references/type-references#getrowsresponse).
   */
  abstract getData(ir: StandardDataFetchAndTransformIR, metadataResolver?: StandardMetadataResolver<unknown>): Promise<GetRowsResponse>;
  /**
   * Return the value range for a column. For dimensions (non-temporal), returns all distinct values. For measures and temporal dimensions, returns min/max. Used to populate filter UIs. Returns a [`ColumnRangeValues`](/docs/api-references/type-references#columnrangevalues).
   */
  abstract getRangeOfColumn(field: string): Promise<ColumnRangeValues>;

  setViewModelOptions(options: GridDataViewModelOptions): void {
    this.#viewModelOptions = options;
  }

  /**
   * Replace the config and reset the page cache. Accepts a partial config; omitted fields use defaults.
   */
  setConfig(config: Partial<StandardTableConfig>): void {
    this.config = { ...defaultConfig, ...config };
    this.pages = [];
    this.topLevelRowCount = 0;
    this.columnMetadata = undefined;
  }

  /**
   * Main entry point for fetching data. Takes a [`StandardDataFetchAndTransformIR`](/docs/api-references/type-references#getrowsir) describing the desired row range, grouping, projection, sort, and filter. Resets the page cache if the IR changed (groupBy, filter, project, or sort), fetches any missing pages in the requested range via `getData`, evicts distant pages if over the cache limit, then flattens the page tree into [`FlattenedDataViewModelParams`](/docs/api-references/type-references#flatteneddataviewmodelparams) for the renderer.
   */
  async getViewModelData(ir: StandardDataFetchAndTransformIR): Promise<FlattenedDataViewModelParams> {
    if (this.#lastIR) {
      // TODO[review] is object equality check enough. this seems heavy
      const groupByChanged = this.#lastIR.groupBy.join(",") !== ir.groupBy.join(",");
      const filterChanged = JSON.stringify(this.#lastIR.filter) !== JSON.stringify(ir.filter);
      const projectChanged = this.#lastIR.project.join(",") !== ir.project.join(",");
      const sortChanged = JSON.stringify(this.#lastIR.sort) !== JSON.stringify(ir.sort);
      if (groupByChanged || filterChanged || projectChanged || sortChanged) {
        this.pages = [];
        this.topLevelRowCount = 0;
        this.columnMetadata = undefined;
      }
    }

    this.#lastIR = ir;

    const plumbing = this.#metadataPlumber?.(ir);

    // resolveLogicalRange needs page slots to walk. Page slots need totalRowCount,
    // which only comes from a getData call. Bootstrap by fetching the first page.
    // TODO: this always requires first page even if the has mentioned different startRow
    if (this.pages.length === 0) {
      const bootstrapIR: StandardDataFetchAndTransformIR = {
        ...ir,
        startRow: 0,
        endRow: this.config.pageSize,
        groupPath: [],
      };
      const response = await this.getData(bootstrapIR, plumbing?.pageWise?.resolver);
      this.pages = this.#createPageSlots(response.totalRowCount, this.config.pageSize);
      this.topLevelRowCount = response.totalRowCount;
      // TODO always load the first page on the top level irrespective of where the user
      // set the startRow and endRow
      if (this.pages.length > 0) {
        this.pages[0].data = response.rowData;
        this.pages[0].metadata = this.#reshapePageMetadata(plumbing, bootstrapIR, response);
      }
    }

    const columnMetadataPromise =
      plumbing?.global && !this.columnMetadata
        ? this.#resolveGlobalMetadata(ir, plumbing)
        : undefined;

    const pagesToFetch = getUnfetchedPagesByLogicalBoundary(this.pages, ir.startRow, ir.endRow);

    await Promise.all([
      columnMetadataPromise?.then(cols => { this.columnMetadata = cols; }),
      ...pagesToFetch.map(async (req) => {
        const fetchIR: StandardDataFetchAndTransformIR = {
          ...ir,
          groupPath: req.selectPath,
          startRow: req.page.physicalStart,
          endRow: req.page.physicalStart + req.page.rowCount,
        };
        const response = await this.getData(fetchIR, plumbing?.pageWise?.resolver);
        req.page.data = response.rowData;
        req.page.metadata = this.#reshapePageMetadata(plumbing, fetchIR, response);
      }),
    ]);

    this.#evictIfNeeded();
    return this.#flatten();
  }

  // TODO when expand happens the IR is not updated, hence the IR does not know the upto date startRow
  //      Example: scroll down to load more page, scroll back up and then expand, IR would have the
  //      startRow from last page load when it was at the very bottom of the page (no idea about scroll back up)
  //      Pass the startRow as parameter
  //      this might have an error for page eviction
  /**
   * Expand a group row to reveal its children. Requires `groupBy` to be set in the IR. Expansion is progressive - each call drills one level deeper into the hierarchy. For example, with `groupBy: ["country", "state", "city"]`: `expand(["USA"])` reveals states, then `expand(["USA", "California"])` reveals cities. Fetches child data on first expand; re-expanding a collapsed group is a cache hit. Returns updated [`FlattenedDataViewModelParams`](/docs/api-references/type-references#flatteneddataviewmodelparams).
   *
   * @param groupPath - Values identifying the group to expand (e.g. `["USA", "California"]`).
   */
  async expand(groupPath: string[]): Promise<FlattenedDataViewModelParams> {
    const result = this.#findGroupRow(groupPath);
    if (!result) {
      return this.#flatten();
    }

    const { page, localRowIndex } = result;
    const existing = page.expandedRows.get(localRowIndex);

    // collapse() only sets expanded=false, pages/data are retained in cache.
    // Re-expanding is a cache hit — no getData call needed.
    if (existing && !existing.expanded) {
      existing.expanded = true;
      return this.#flatten();
    }

    const ir = this.#lastIR!;
    const childGroupBy = ir.groupBy.slice(groupPath.length);
    const hasOutsideFacetDims = this.#hasOutsideFacetDims();
    const isLeafFacet = childGroupBy.length === 0;

    if (isLeafFacet && !hasOutsideFacetDims) {
      throw new Error("Cannot expand a leaf row with no outside facet dimensions");
    }

    const childIR: StandardDataFetchAndTransformIR = {
      startRow: 0,
      endRow: this.config.pageSize,
      groupPath: groupPath,
      groupBy: ir.groupBy,
      project: ir.project,
      sort: ir.sort,
      filter: ir.filter,
      metadata: ir.metadata,
    };

    const plumbing = this.#metadataPlumber?.(childIR);
    const response = await this.getData(childIR, plumbing?.pageWise?.resolver);
    const childPages = this.#createPageSlots(response.totalRowCount, this.config.pageSize);
    // TODO always loaded in to first page. this should not be mandatory
    childPages[0].data = response.rowData;
    childPages[0].metadata = this.#reshapePageMetadata(plumbing, childIR, response);

    const group: ExpandedGroup = {
      expanded: true,
      totalRowCount: response.totalRowCount,
      pages: childPages,
    };
    page.expandedRows.set(localRowIndex, group);

    this.#evictIfNeeded();
    return this.#flatten();
  }

  /**
   * Collapse a group row. Requires `groupBy` to be set in the IR. Hides the children of the specified group but retains their data in cache, so re-expanding is instant without a `getData` call. Returns updated [`FlattenedDataViewModelParams`](/docs/api-references/type-references#flatteneddataviewmodelparams).
   *
   * @param groupPath - Values identifying the group to collapse (e.g. `["USA"]`).
   */
  async collapse(groupPath: string[]): Promise<FlattenedDataViewModelParams> {
    const result = this.#findGroupRow(groupPath);
    if (!result) {
      return this.#flatten();
    }

    const { page, localRowIndex } = result;
    const existing = page.expandedRows.get(localRowIndex);
    if (existing) {
      existing.expanded = false;
    }

    return this.#flatten();
  }

  #hasOutsideFacetDims(): boolean {
    const ir = this.#lastIR!;
    const groupBySet = new Set(ir.groupBy);
    return ir.project.some((col) => {
      const def = this.getColumn(col);
      return def && def.type === "dimension" && !groupBySet.has(col);
    });
  }

  #createPageSlots(totalRowCount: number, pageSize: number): PageNode[] {
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

  #findGroupRow(select: string[]): { page: PageNode; localRowIndex: number } | null {
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

  #flatten(): FlattenedDataViewModelParams {
    const ir = this.#lastIR!;
    const data: any[][] = ir.project.map(() => []);
    const hasGroupBy = ir.groupBy.length > 0;
    const rowFacet: (string | null)[] | undefined = hasGroupBy ? [] : undefined;
    const rowMetaBytes: number[] | undefined = hasGroupBy ? [] : undefined;
    const hasOutsideFacetDims = this.#hasOutsideFacetDims();
    const columnDefs = ir.project.map((col) => this.getColumn(col));

    const totalRows = this.computeTotalLogicalRows();
    const clampedStart = Math.min(ir.startRow, Math.max(0, totalRows - 1));
    const cursor = findTargetSlotPath(this.pages, clampedStart);

    if (cursor.length === 0) {
      const columnFacets: (string | null)[][] = [ir.project.map((col) => {
        const def = this.getColumn(col);
        return def?.displayName ?? col;
      })];
      const options: GridDataViewModelOptions = { ...this.#viewModelOptions };
      return { data, columnFacets, rowFacet, rowMeta: rowMetaBytes ? new Uint8Array(rowMetaBytes) : undefined, options, totalRows, offsetTop: 0 };
    }

    const { blockStart, blockEnd } = findContiguousPageBlocks(this.pages, cursor);

    const offsetTop = this.#computeOffsetTop(this.pages, blockStart, 0);

    const metadataValueRows: ValueRowMetadata[] = [];
    const metadataValueCells: ValueCellMetadata[] = [];

    const collectPageMetadata = (page: PageNode) => {
      const offset = data[0].length;
      if (page.metadata?.rows) {
        for (const row of page.metadata.rows) {
          metadataValueRows.push({ rowIndex: offset + row.rowIdx, meta: row.meta });
        }
      }
      if (page.metadata?.cells) {
        for (const cell of page.metadata.cells) {
          metadataValueCells.push({ colIndex: cell.colIdx, rowIndex: offset + cell.rowIdx, meta: cell.meta });
        }
      }
    };

    const pushFacetRow = (page: PageNode, rowIdx: number, depth: number, isExpanded: boolean, groupFieldProject: string[]) => {
      rowFacet!.push(page.data![0][rowIdx]);
      const isLeaf = (depth === ir.groupBy.length - 1) && !hasOutsideFacetDims;
      rowMetaBytes!.push(createRowMeta(depth, isLeaf, isExpanded));
      for (let colIdx = 0; colIdx < ir.project.length; colIdx++) {
        const colDef = columnDefs[colIdx];
        if (colDef.type === "measure") {
          const projIdx = groupFieldProject.indexOf(ir.project[colIdx]);
          data[colIdx].push(page.data![projIdx][rowIdx]);
        } else {
          data[colIdx].push(null);
        }
      }
    };

    const pushDataRow = (page: PageNode, rowIdx: number, depth: number) => {
      if (rowFacet) rowFacet.push(null);
      if (rowMetaBytes) rowMetaBytes.push(createRowMeta(depth, true, false));
      for (let colIdx = 0; colIdx < ir.project.length; colIdx++) {
        data[colIdx].push(page.data![colIdx][rowIdx]);
      }
    };

    const FULL_START: TargetSlotPath = [{ pageIdx: 0, rowIdx: -1 }];
    const fullEnd = (pages: PageNode[]): TargetSlotPath => [{ pageIdx: pages.length - 1, rowIdx: -1 }];

    // Returns true if walked all pages at this level (reached natural end)
    const walkBlock = (pages: PageNode[], depth: number, start: TargetSlotPath, end: TargetSlotPath): boolean => {
      const isFacetLevel = depth < ir.groupBy.length;
      const groupFieldProject = isFacetLevel ? outputColumnsForDepth(ir, depth, this.schemaInfo) : null;

      const startPageIdx = start[0].pageIdx;
      const endPageIdx = end[0].pageIdx;
      const startRowIdx = start[0].rowIdx;
      const endRowIdx = end[0].rowIdx;

      for (let i = startPageIdx; i <= endPageIdx; i++) {
        const page = pages[i];
        if (!page.data) return false;
        collectPageMetadata(page);
        const isFirstPage = i === startPageIdx;
        const isLastPage = i === endPageIdx;

        const rowStart = (isFirstPage && startRowIdx >= 0) ? startRowIdx : 0;

        for (let rowIdx = rowStart; rowIdx < page.rowCount; rowIdx++) {
          const expanded = page.expandedRows.get(rowIdx);
          const isExpanded = expanded?.expanded === true;
          const isEndBoundaryRow = isLastPage && endRowIdx >= 0 && rowIdx === endRowIdx;

          if (isFacetLevel) {
            pushFacetRow(page, rowIdx, depth, isExpanded, groupFieldProject!);

            if (isExpanded) {
              const childStart = (isFirstPage && rowIdx === startRowIdx && start.length > 1) ? start.slice(1) : FULL_START;
              const childEnd = (isEndBoundaryRow && end.length > 1) ? end.slice(1) : fullEnd(expanded!.pages);
              const childComplete = walkBlock(expanded!.pages, depth + 1, childStart, childEnd);

              if (isEndBoundaryRow && !childComplete) return false;
            } else if (isEndBoundaryRow) {
              return false;
            }
          } else {
            pushDataRow(page, rowIdx, depth);
          }
        }
      }

      return endPageIdx === pages.length - 1;
    };

    walkBlock(this.pages, 0, blockStart, blockEnd);
    const rowMeta = rowMetaBytes ? new Uint8Array(rowMetaBytes) : undefined;

    const columnFacets: (string | null)[][] = [ir.project.map((col) => {
      const def = this.getColumn(col);
      return def?.displayName ?? col;
    })];

    const options: GridDataViewModelOptions = {
      ...this.#viewModelOptions,
    };

    const metadata: Partial<ViewModelMetadata> = {
      valueColumns: (this.columnMetadata ?? []).map(col => ({ colIndex: col.colIdx, meta: col.meta })),
      valueRows: metadataValueRows,
      valueCells: metadataValueCells,
    };

    return { data, columnFacets, rowFacet, rowMeta, options, totalRows, offsetTop, metadata };
  }

  #reshapePageMetadata(plumbing: StandardMetadataPlumbing | undefined, ir: StandardDataFetchAndTransformIR, response: GetRowsResponse): PageMetadata | undefined {
    if (!plumbing?.pageWise) return undefined;
    return plumbing.pageWise.reshaper.reshape({ ir, pageMetadata: response.metadata ?? {}, rowData: response.rowData, schema: this.schema });
  }

  async #resolveGlobalMetadata(
    ir: StandardDataFetchAndTransformIR,
    plumbing: StandardMetadataPlumbing,
  ): Promise<StandardColumnMetadata[]> {
    const raw = await this.getGlobalMetadata(ir, plumbing.global!.resolver);
    return plumbing.global!.reshaper.reshape({ ir, raw, schema: this.schema });
  }

  protected buildResolverInput(ir: StandardDataFetchAndTransformIR): StandardMetadataResolverInput {
    return { ir, schema: this.schema };
  }

  /**
   * Fetch the raw global metadata by invoking the plumbing's resolver. Override to adapt the resolver's raw
   * result before the reshaper runs on it - e.g. an API-backed model unwrapping a deviating server's response.
   */
  protected async getGlobalMetadata(ir: StandardDataFetchAndTransformIR, resolver: StandardGlobalMetadataResolver): Promise<StandardRawMetadata> {
    return resolver.resolve(this.buildResolverInput(ir));
  }

  /**
   * Returns the current expand state - all group paths that are currently expanded after any sequence of `expand`/`collapse` calls (e.g. `[["USA"], ["USA", "California"]]`).
   */
  getExpandedPaths(): string[][] {
    const paths: string[][] = [];
    const walk = (pages: PageNode[], prefix: string[]): void => {
      for (const page of pages) {
        if (!page.data) continue;
        for (const [rowIdx, group] of page.expandedRows) {
          if (!group.expanded) continue;
          const value = String(page.data[0][rowIdx]);
          const path = [...prefix, value];
          paths.push(path);
          walk(group.pages, path);
        }
      }
    };
    walk(this.pages, []);
    return paths;
  }

  /**
   * Returns the total number of visible logical rows. Although pages are nested in a tree structure, the data is laid out flat for rendering. Each expanded group's `expanded` flag determines whether its nested children count toward the total. This walks the entire page tree and sums rows from all levels where `expanded` is `true`.
   */
  computeTotalLogicalRows(): number {
    return computeForLevel(this.pages, this.topLevelRowCount);
  }

  // Counts logical rows above the contiguous block start.
  //
  // Example: blockStart = [{ pageIdx: 2, rowIdx: 1 }, { pageIdx: 0, rowIdx: -1 }]
  //   depth 0: sum logical rows for pages[0] and pages[1] (everything before pageIdx=2)
  //            then within pages[2], count rows 0..1 (rowIdx=1 means path continues into row 1's children)
  //            recurse into row 1's expanded child pages at depth 1
  //   depth 1: sum logical rows for child pages before pageIdx=0 (none in this case)
  //            rowIdx=-1 means terminal — stop here
  #computeOffsetTop(pages: PageNode[], blockStart: TargetSlotPath, depth: number): number {
    const entry = blockStart[depth];
    if (!entry) return 0;

    let offset = 0;
    for (let i = 0; i < entry.pageIdx; i++) {
      offset += pages[i].rowCount;
      for (const [, expanded] of pages[i].expandedRows) {
        if (expanded.expanded) {
          offset += computeForLevel(expanded.pages, expanded.totalRowCount);
        }
      }
    }

    if (entry.rowIdx >= 0) {
      const page = pages[entry.pageIdx];
      for (let rowIdx = 0; rowIdx < entry.rowIdx; rowIdx++) {
        offset++;
        const expanded = page.expandedRows.get(rowIdx);
        if (expanded?.expanded) {
          offset += computeForLevel(expanded.pages, expanded.totalRowCount);
        }
      }
      // the boundary row itself is emitted by walkBlock, don't count it
      // but count child rows before blockStart within its children
      const childExpanded = page.expandedRows.get(entry.rowIdx);
      if (childExpanded?.expanded) {
        offset += this.#computeOffsetTop(childExpanded.pages, blockStart, depth + 1);
      }
    }

    return offset;
  }

  #countFetchedPages(): number {
    return this.#countFetchedPagesInTree(this.pages);
  }

  #countFetchedPagesInTree(pages: PageNode[]): number {
    let count = 0;
    for (const page of pages) {
      if (page.data !== null) count++;
      for (const [, expanded] of page.expandedRows) {
        count += this.#countFetchedPagesInTree(expanded.pages);
      }
    }
    return count;
  }

  #evictIfNeeded(): void {
    while (this.#countFetchedPages() > this.config.maxNumPageBeforeEviction) {
      const farthest = this.#findFarthestPage();
      if (!farthest) break;
      this.#evictPage(farthest);
    }
  }

  #findFarthestPage(): PageNode | null {
    const targetSlot = this.#lastIR ? Math.floor(this.#lastIR.startRow / this.config.pageSize) : 0;
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

  #evictPage(page: PageNode): void {
    page.data = null;
    page.metadata = undefined;
    for (const [, expanded] of page.expandedRows) {
      for (const childPage of expanded.pages) {
        this.#evictPage(childPage);
      }
    }
  }
}
