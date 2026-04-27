import {
  DataSchema,
  DomainValues,
  FlatTableConfig,
  GetRowsIR,
  GetRowsResponse,
  PageNode,
  ExpandedGroup,
} from "./types";
import { FlattenedDataViewModelParams, createRowMeta } from "../renderer/flattened-data-viewmodel";
import { GridDataViewModelOptions } from "../renderer/types";

const DEFAULT_PAGE_SIZE = 10000;
const DEFAULT_MAX_CACHE_SIZE = 3 * (10 ** 6);
// const DEFAULT_MAX_CACHE_SIZE = 50;

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

export abstract class StandardTableDataModel {
  config: FlatTableConfig;
  pages: PageNode[] = [];
  topLevelRowCount = 0;
  private lastIR: GetRowsIR | null = null;
  private viewModelOptions?: GridDataViewModelOptions;
  private schemaMap: Map<string, DataSchema>;

  constructor(config: FlatTableConfig) {
    // TODO[review] merge with default config
    this.config = config;
    this.schemaMap = new Map(config.schema.map((s) => [s.name, s]));
  }

  abstract getData(ir: GetRowsIR): Promise<GetRowsResponse>;
  abstract getDomainValues(field: string): Promise<DomainValues>;

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

  async getViewModelData(ir: GetRowsIR): Promise<FlattenedDataViewModelParams> {
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
    // TODO: this always requires first page even if the has mentioned different startRow
    if (this.pages.length === 0) {
      const bootstrapIR: GetRowsIR = {
        ...ir,
        startRow: 0,
        endRow: this.pageSize,
        groupPath: [],
      };
      const response = await this.getData(bootstrapIR);
      this.pages = this.createPageSlots(response.totalRowCount, this.pageSize);
      this.topLevelRowCount = response.totalRowCount;
      // TODO always load the first page on the top level irrespective of where the user
      // set the startRow and endRow
      if (this.pages.length > 0) {
        this.pages[0].data = response.rowData;
      }
    }

    const pagesToFetch = getUnfetchedPagesByLogicalBoundary(this.pages, ir.startRow, ir.endRow);

    await Promise.all(pagesToFetch.map(async (req) => {
      const fetchIR: GetRowsIR = {
        ...ir,
        groupPath: req.selectPath,
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
  async expand(groupPath: string[]): Promise<FlattenedDataViewModelParams> {
    const result = this.findGroupRow(groupPath);
    if (!result) {
      return this.flatten();
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
    const childGroupBy = ir.groupBy.slice(groupPath.length);
    const hasOutsideFacetDims = this.hasOutsideFacetDims();
    const isLeafFacet = childGroupBy.length === 0;

    if (isLeafFacet && !hasOutsideFacetDims) {
      throw new Error("Cannot expand a leaf row with no outside facet dimensions");
    }

    const childIR: GetRowsIR = {
      startRow: 0,
      endRow: this.pageSize,
      groupPath: groupPath,
      groupBy: ir.groupBy,
      project: ir.project,
      sort: ir.sort,
      filter: ir.filter,
    };

    const response = await this.getData(childIR);
    const childPages = this.createPageSlots(response.totalRowCount, this.pageSize);
    // TODO always loaded in to first page. this should not be mandatory
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

  async collapse(groupPath: string[]): Promise<FlattenedDataViewModelParams> {
    const result = this.findGroupRow(groupPath);
    if (!result) {
      return this.flatten();
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

  private flatten(): FlattenedDataViewModelParams {
    const ir = this.lastIR!;
    const data: any[][] = ir.project.map(() => []);
    const hasGroupBy = ir.groupBy.length > 0;
    const rowFacet: (string | null)[] | undefined = hasGroupBy ? [] : undefined;
    const rowMetaBytes: number[] | undefined = hasGroupBy ? [] : undefined;
    const hasOutsideFacetDims = this.hasOutsideFacetDims();
    const columnDefs = ir.project.map((col) => this.schemaMap.get(col)!);

    const totalRows = this.computeTotalLogicalRows();
    const clampedStart = Math.min(ir.startRow, Math.max(0, totalRows - 1));
    const cursor = findTargetSlotPath(this.pages, clampedStart);

    if (cursor.length === 0) {
      const columnFacets: (string | null)[][] = [ir.project.map((col) => {
        const def = this.schemaMap.get(col);
        return def?.displayName ?? col;
      })];
      const options: GridDataViewModelOptions = { ...this.viewModelOptions };
      return { data, columnFacets, rowFacet, rowMeta: rowMetaBytes ? new Uint8Array(rowMetaBytes) : undefined, options, totalRows, offsetTop: 0 };
    }

    const { blockStart, blockEnd } = findContiguousPageBlocks(this.pages, cursor);

    const offsetTop = this.computeOffsetTop(this.pages, blockStart, 0);

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
      const groupFieldProject = isFacetLevel ? this.buildProjectionForDepth(depth) : null;

      const startPageIdx = start[0].pageIdx;
      const endPageIdx = end[0].pageIdx;
      const startRowIdx = start[0].rowIdx;
      const endRowIdx = end[0].rowIdx;

      for (let i = startPageIdx; i <= endPageIdx; i++) {
        const page = pages[i];
        if (!page.data) return false;
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
      const def = this.schemaMap.get(col);
      return def?.displayName ?? col;
    })];

    const options: GridDataViewModelOptions = {
      ...this.viewModelOptions,
    };

    return { data, columnFacets, rowFacet, rowMeta, options, totalRows, offsetTop };
  }

  private buildProjectionForDepth(depth: number): string[] {
    const ir = this.lastIR!;
    const groupField = ir.groupBy[depth];
    const measureCols: string[] = [];
    for (const [name, def] of this.schemaMap) {
      // TODO[now] aggregation function will always be present for measure columns
      if (def.aggregateFn) measureCols.push(name);
    }
    return [groupField, ...measureCols];
  }

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
  private computeOffsetTop(pages: PageNode[], blockStart: TargetSlotPath, depth: number): number {
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
        offset += this.computeOffsetTop(childExpanded.pages, blockStart, depth + 1);
      }
    }

    return offset;
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
}
