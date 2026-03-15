# Flat Table DataModel

## Usage

- Load csv / json dataset directly in browser. Essentially imagine the database table can be loaded in client side as is (duckdb)
- Fetch data from server
- Provides maximum control to dev but also most of the work is done by developer where they push the readymade data to datamodel so that datamodel can populate data-viewmodel.

## Pivot vs Flat Table

- Operators like sort, filter, search are same
- Pivot works on table algebra + reshaping of table. Value cells can only have measure values. Flat table can have dimension + measure in value cells. Reshaping of table does not happen. Group by is the major operation.
- Pivot table does not bring many rows, hence each iteration can fetch the full required data every time. Flat table fetches data incrementally and manages cache in client side.

---

## Class Hierarchy

```
FlatTableDataModel (abstract)
└── ServersideFlatTableDataModel (paginated getRows contract — server API)
    └── DuckDBWasmFlatTableDataModel (same paginated contract, backed by local DuckDB WASM)
```

**FlatTableDataModel** — abstract base. Owns the tree structure, cache management, flattening into `FlattenedDataViewModel`. Subclasses implement data fetching.

**ServersideFlatTableDataModel** — implements fetching via a server API. The server receives `getRows` requests with select, sort, filter, pagination params and returns a page of rows + total count.

**DuckDBWasmFlatTableDataModel** — implements the same paginated contract but queries a local DuckDB WASM instance. Same chunking, same cache behavior, just a different backing store. This lets you load CSV/JSON directly in the browser and get the full paginated experience without a server.

### Why not a SimpleInMemoryDataModel?

A plain JS in-memory model (no DuckDB) has a niche for small datasets where you don't want the DuckDB WASM dependency (~4MB). But it would require reimplementing sort, filter, and groupBy in plain JS, which is significant work. DuckDBWasmFlatTableDataModel already covers local data with full SQL capabilities. A pure-JS model can be added later behind the same `FlatTableDataModel` interface if the need arises.

---

## Config

```typescript
interface FlatTableConfig {
  groupBy: string[];                    // hierarchy fields, e.g. ["country", "year"]
  columns: string[];                    // visible columns in order, e.g. ["athlete", "sport", "gold", "silver", "bronze"]
  defs: FlatTableColumnDef[];           // column definitions (irrespective of order)
  sort?: SortItem[];                    // multi-level sort
  filter?: FilterItem[];               // e.g. [{ field: "sport", operator: "eq", value: "Swimming" }]
  pageSize?: number;                    // rows per page (default 10k)
  maxCacheSize?: number;                // max pages to keep in memory (default 20)
}

interface FlatTableColumnDef {
  field: string;
  type: "dimension" | "measure";
  aggregation?: "sum" | "count" | "avg" | "min" | "max";  // optional — shown on group rows
}
```

**groupBy** defines which fields form the row hierarchy. Order matters — `["country", "year"]` produces Country → Year nesting, `["year", "country"]` produces Year → Country nesting.

**columns** defines which fields are visible and their order. Fields not in `columns` and not in `groupBy` are ignored — they don't appear in any query.

**defs** provides metadata for all fields regardless of whether they are in `columns` or `groupBy`. The `type` distinguishes dimensions from measures. `aggregation` is optional — if set, group rows show the aggregated value for that column; if not, group rows show `null`.

### Sort

Sort works the same way as pivot sort — multi-level, where each level can sort either:

- **Lexicographically** — by the field's own values (e.g., sort "country" A→Z)
- **By a measure** — by an aggregated measure value (e.g., sort "country" by SUM(gold) descending)

```typescript
type SortItem =
  | { field: string; direction: "asc" | "desc" }                              // lexicographic
  | { field: string; direction: "asc" | "desc"; sortBy: string };             // by measure

// Example: sort countries by total gold (desc), then years lexicographically (asc)
sort: [
  { field: "country", direction: "desc", sortBy: "gold" },
  { field: "year", direction: "asc" },
]
```

At group level, measure-based sort uses the aggregation:

```sql
SELECT country, COUNT(*) AS __count__, SUM(gold) AS gold
FROM data GROUP BY country ORDER BY SUM(gold) DESC
```

At leaf level, sort applies directly to the column values.

---

## Data Fetching

### The getRows contract

Subclasses implement:

```typescript
abstract getRows(ir: {
  startRow: number;
  endRow: number;
  select: string[];             // values identifying the expanded path (relational algebra: selection)
  groupBy: string[];            // fields defining the hierarchy
  project: string[];            // which fields to return (relational algebra: projection)
  sort: SortItem[];
  filter: FilterItem[];
}): Promise<{
  rowData: any[][];             // column-major page of rows
  totalRowCount: number;        // total rows at this level (not page size — needed for pagination)
}>;
```

`totalRowCount` is the total number of rows at this level, not the number returned in `rowData`. This is needed for pagination — when a group has 263 leaf rows and pageSize is 100, the datamodel needs to know there are 3 pages total. It's also needed to compute scroll height within a group (totalRowCount × rowHeight).

Group display counts like "United States (1109)" come from a `COUNT(*)` column in the rowData itself, not from `totalRowCount`.

### What select means

`select` is the **path of values** into the tree (from relational algebra — selection = choosing rows). Its length tells you which level you're at relative to `groupBy`:

| select | groupBy level | meaning |
|---|---|---|
| `[]` | 0 | fetch top-level groups (country) |
| `["United States"]` | 1 | fetch sub-groups within US (year) |
| `["United States", "2008"]` | 2 (leaf) | fetch raw rows within US/2008 |

### Parallel fetching: incremental vs initial render

There are two cases where data needs to be fetched:

**Case 1: Incremental (user action).** User expands a single group. One `getRows` call with the new `select` path. Simple, single query.

**Case 2: Initial render with pre-expanded state.** User opens a saved view where multiple groups are already expanded (e.g., USA/2008, USA/2012, and UK all open). The datamodel needs multiple queries at different tree depths:

```
getRows({ select: [],                            ... })  → top-level groups
getRows({ select: ["United States"],              ... })  → year sub-groups of US
getRows({ select: ["United States", "2008"],      ... })  → leaf rows of US/2008
getRows({ select: ["United States", "2012"],      ... })  → leaf rows of US/2012
getRows({ select: ["UK"],                         ... })  → year sub-groups of UK
                                                            ─────────
                                                            5 queries
```

These are fired in parallel via `Promise.all`. Each query is independent — different `select` path, potentially different GROUP BY depth, different result shape.

**Why parallel queries instead of a single UNION ALL?**

- **Same latency** — all queries fire at once, total time = slowest single query
- **Progressive rendering** — top-level groups can render immediately while deeper queries are still in flight
- **Clean IR** — each `getRows` call has a simple, uniform shape. No schema mismatch (group rows have COUNT/aggregations, leaf rows have raw values — these don't UNION naturally)
- **Server-friendly** — can be batched into one HTTP request at the transport layer without complicating the IR

The only scenario where UNION ALL would be better is if there's a hard constraint on concurrent requests (e.g., server limits to 1 connection). In that case, HTTP-level batching (sending multiple IR requests in one HTTP POST) is still simpler than merging different query shapes into one SQL statement.

### SQL generation by level

Given `groupBy: ["country", "year"]`, `project: ["athlete", "sport", "gold", "silver", "bronze"]`:

**Level 0 — top groups (`select: []`):**

```sql
SELECT country, COUNT(*) AS __count__, SUM(gold) AS gold
FROM data
WHERE sport = 'Swimming'           -- filter (if any)
GROUP BY country
ORDER BY country
```

Returns group rows. Columns without aggregation are `null`.

**Level 1 — sub-groups (`select: ["United States"]`):**

```sql
SELECT year, COUNT(*) AS __count__, SUM(gold) AS gold
FROM data
WHERE country = 'United States'     -- select values become WHERE clauses
  AND sport = 'Swimming'            -- filter (if any)
GROUP BY year
ORDER BY year
```

**Leaf level — raw rows (`select: ["United States", "2008"]`):**

```sql
SELECT athlete, sport, gold, silver, bronze
FROM data
WHERE country = 'United States' AND year = '2008'
  AND sport = 'Swimming'            -- filter (if any)
ORDER BY gold DESC                  -- sort (if any)
LIMIT 100 OFFSET 0                  -- pagination
```

No GROUP BY, no aggregation. Raw rows with all projected columns.

**The pattern:** Each entry in `select` pairs with the corresponding `groupBy` field to add a `WHERE field = value` clause. The next ungrouped field in `groupBy` becomes the `GROUP BY`. At leaf level (all groupBy fields consumed), it's a plain `SELECT` of projected columns.

---

## DataModel Internal State

The datamodel stores pages in a **tree** that mirrors the grouping hierarchy. Each level of the tree corresponds to a depth in the `groupBy` config. Pages hold raw column-major arrays from the server. No per-row objects are created.

### Two row numbering systems

- **Physical rows (P)** — the row position in the database/server result at a given select path. Stable — unaffected by expand/collapse of other groups. This is what `startRow`/`endRow` in `getRows` uses.
- **Logical rows (L)** — the display position in the flattened view. Changes when groups expand/collapse (children interleave, shifting everything after). Computed dynamically during the flatten step.

### Page tree structure

```typescript
interface PageNode {
  data: any[][];                              // column-major rows from server
  physicalStart: number;                      // P start (position in server result)
  rowCount: number;                           // actual rows in this page
  totalRowCount: number;                      // total rows at this level (from server, for pagination)
  expandedRows: Map<number, ExpandedGroup>;   // rowIndex within this page → child tree
}

interface ExpandedGroup {
  expanded: boolean;          // false = collapsed but pages retained in cache
  totalRowCount: number;      // from server — total children (for scroll height)
  pages: PageNode[];          // child pages, ordered by physicalStart
}
```

The root of the tree holds the top-level pages (depth 0). When a row is expanded, its `expandedRows` entry holds child pages at the next depth. This recurses for deeper groupBy levels.

```
root                                     select: []
├── page0 (P: 0-29, 30 rows)
│   └── expandedRows:
│       ├── 0 → USA (totalRowCount: 60)  select: ["USA"]
│       │   ├── usa_page0 (P: 0-29)
│       │   │   └── expandedRows:
│       │   │       └── 3 → California   select: ["USA", "California"]
│       │   │           └── ca_page0
│       │   └── usa_page1 (P: 30-59)
│       └── 5 → Canada (totalRowCount: 45)  select: ["Canada"]
│           ├── can_page0 (P: 0-29)
│           └── can_page1 (P: 30-44)
├── page1 (P: 30-59, 30 rows)
├── page2 (P: 60-89, 30 rows)
└── page3 (P: 90-119, 30 rows)
```

The `select` path for any page is derived by walking up the tree — no need to store it on the page.

### Logical row computation

L values are **not stored** — they are computed during the flatten step by walking the tree in order. For each page, iterate its rows. When a row has an `expandedRows` entry, recurse into the child pages before continuing to the next row:

```
Flatten page0 (30 rows, USA expanded at row 0, Canada at row 5):

L0:    USA (group row, page0 row 0)
L1-30:   usa_page0 rows (30 rows)
         [if California expanded at usa_page0 row 3, recurse into ca_page0 here]
L31-60:  usa_page1 rows (30 rows)
L61:   page0 row 1
L62:   page0 row 2
L63:   page0 row 3
L64:   page0 row 4
L65:   Canada (group row, page0 row 5)
L66-95:  can_page0 rows (30 rows)
L96-110: can_page1 rows (15 rows)
L111:  page0 row 6
...
```

The total logical row count of the root = sum of all page rows + sum of all expanded children (recursively). This gives the scroll height.

### Expand

1. User clicks expand on a group row (e.g., "USA" at row 0 in page0)
2. Check if `expandedRows` already has an entry for that row (previously collapsed but pages retained)
   - **Yes**: set `expanded = true`, skip fetch — data is already cached
   - **No**: fetch children via `getRows({ select: ["USA"], startRow: 0, endRow: pageSize, ... })`, create `ExpandedGroup { expanded: true, totalRowCount, pages: [new PageNode] }`
3. Recompute total logical rows (root L range grows by the loaded children)
4. Flatten and rebuild `FlattenedDataViewModel`
5. Notify layout to re-render

### Collapse

1. User clicks collapse on "USA"
2. Set `expanded = false` on page0's `expandedRows` entry for that row — pages stay in cache
3. Recompute total logical rows (root L range shrinks)
4. Flatten and rebuild `FlattenedDataViewModel` (flatten skips entries with `expanded = false`)
5. Pages are only removed when `numMaxPages` eviction needs the budget

### Pagination within a group

At any level, if the group has more rows than fit in one page, multiple pages exist for that group. Pages are fetched on demand as the user scrolls into the expanded region:

```
USA expanded, totalRowCount: 60, pageSize: 30:

  usa_page0  P: 0-29   (loaded)
  usa_page1  P: 30-59  (fetched when user scrolls to it)
```

The `startRow`/`endRow` in `getRows` is always **per-depth** — relative to the select path, not the global logical position.

---

## Cache Management

Cache management is purely a datamodel concern. The datamodel maintains a page tree and evicts pages to bound memory. The viewmodel knows nothing about caching — it receives dense arrays and renders them.

### Eviction rules

`numMaxPages` (from config) bounds the total number of pages in the tree.

1. **numMaxPages cap.** When the total page count exceeds `numMaxPages`, evict the page farthest from the viewport.
2. **Child pages count toward numMaxPages.** Expanding USA with 2 child pages consumes 2 from the budget.
3. **Evicting a parent page cascades.** If page0 is evicted and it has expanded rows with child pages, those child pages are evicted too (orphaned).

### Example: flat (ungrouped) pagination

```
pageSize: 30, numMaxPages: 4

1. Load page0 (P: 0-29)
   root.pages: [page0], 1 page

2. Load page1 (P: 30-59)
   root.pages: [page0, page1], 2 pages

3. User jumps to page3 (P: 90-119)
   root.pages: [page0, page1, _, page3], 3 pages

4. Load page2 (P: 60-89)
   root.pages: [page0, page1, page2, page3], 4 pages — at cap

5. Need page4? Evict page0 (farthest from viewport)
   root.pages: [_, page1, page2, page3, page4], 4 pages
```

### Example: grouped pagination

```
pageSize: 30, numMaxPages: 4

1. Load root page0 (P: 0-29, 30 countries)
   root.pages: [page0], 1 page

2. Expand USA (row 0 in page0, totalRowCount: 60)
   Fetch usa_page0 (P: 0-29)
   page0.expandedRows = { 0 → { expanded: true, totalRowCount: 60, pages: [usa_page0] } }
   2 pages total

3. Scroll down into USA's children → fetch usa_page1 (P: 30-59)
   USA's pages: [usa_page0, usa_page1]
   3 pages total

4. Scroll past page0 → fetch root page1 (P: 30-59)
   root.pages: [page0, page1]
   4 pages total — at cap

5. Need root page2? Evict usa_page0 (farthest from viewport)
   USA's pages: [_, usa_page1]
   4 pages total
   Note: usa_page0 evicted — hole in USA's children
```

### What triggers cache changes

| Trigger | Action |
|---|---|
| Scroll | Fetch page if not cached, add to tree. Evict farthest page if over numMaxPages |
| Expand | Fetch child page, add to tree. Evict if over numMaxPages |
| Collapse | Remove child pages from tree (cascade) |
| Config change (sort, filter, groupBy) | Full invalidation — clear entire page tree, re-fetch from root |

---

## Building FlattenedDataViewModel

The viewmodel is a **dense array of contiguous rows** — it has no concept of caching, pages, or holes. The datamodel flattens its page tree into the viewmodel. If a page is missing (hole in the tree), the datamodel fetches it first and then populates the viewmodel.

The flatten is **greedy** — all contiguous pages in the tree are emitted into the viewmodel, not just the pages covering the current viewport. This means scrolling within the contiguous region is instant (array lookups, no async).

### The flatten process

1. Walk the page tree in depth-first order (root pages in order, recursing into expanded rows)
2. For each row, emit it into the flat arrays and increment the logical row counter
3. When a row has an `expandedRows` entry, recurse into the child pages before continuing
4. If a child page is missing (not loaded), the datamodel fetches it — the viewmodel is only built from loaded, contiguous data
5. Generate `rowMeta` (depth from tree level, isLeaf from whether it's the deepest groupBy level, isExpanded from whether `expandedRows` has an entry) and `rowFacet` (the group label or row label)

### ViewModel offsets

The viewmodel may not start at logical row 0. It needs offsets so the layout positions it correctly in the scroll space:

```
Total logical rows: 100,000
Viewmodel covers L: 5,000–15,000

FlattenedDataViewModel:
  data: any[][]                 ← 10,000 rows of dense data
  rowMeta: Uint8Array           ← 10,000 entries
  rowFacet: (string | null)[]   ← 10,000 labels
  offsetTop: 5000               ← rows above the viewmodel (empty scroll space)
```

The layout uses `offsetTop × rowHeight` as the top padding. The bottom padding is derived: `(totalLogicalRows - offsetTop - numRows) × rowHeight`. This correctly sizes the scrollbar for the full dataset while only the loaded region has real cells. Pagination is row-only — all columns are always loaded.

The total logical row count is computed from the tree: sum of all root page rows + sum of all `totalRowCount` for expanded groups (recursively). This includes rows not yet loaded — the `totalRowCount` from the server tells us how many rows exist even if not all pages are fetched.

---

## Cache Invalidation

Different config changes have different cache impacts:

| Change | Impact | Reason |
|---|---|---|
| Expand a group | Fetch child page, add to tree | Tree grows, L range expands |
| Collapse a group | Set `expanded = false` — pages retained in cache | Tree shrinks logically, L range contracts, no eviction |
| Change `groupBy` | **Full invalidation** | Entire tree structure changes |
| Change `groupBy` order | **Full invalidation** | `[country, year]` vs `[year, country]` are different hierarchies |
| Change `filter` | **Full invalidation** | Counts change, group membership changes, leaf rows change |
| Change `sort` | **Invalidate leaf pages** | Group-level results unchanged (just counts), but leaf row order changes |
| Change `columns`/`project` | **Invalidate leaf pages** | Group pages may change if aggregation columns added/removed |
| Scroll (new page) | Fetch + add to tree | Extends contiguous block |

On full invalidation: clear entire page tree, re-fetch top-level groups, rebuild viewmodel from scratch.

---

## Sort and Filter

Sort and filter are passed through to every `getRows` call. They affect all levels:

**Filter** changes which rows match, which changes group counts and which groups exist:

```sql
-- Without filter: United States (1109)
-- With filter sport='Swimming': United States (87)
-- Groups with 0 matches disappear entirely
```

**Sort** at group level uses the group field (or aggregated column). At leaf level it uses the sort column:

```sql
-- Group level, sorted by SUM(gold) DESC:
SELECT country, COUNT(*) AS __count__, SUM(gold) AS gold
FROM data GROUP BY country ORDER BY SUM(gold) DESC

-- Leaf level, sorted by gold DESC:
SELECT athlete, sport, gold, silver, bronze
FROM data WHERE country = 'United States' AND year = '2008'
ORDER BY gold DESC
LIMIT 100 OFFSET 0
```

---

## Full Lifecycle Example

Config: `groupBy: ["country", "year"]`, `project: ["athlete", "sport", "gold", "silver", "bronze"]`, `pageSize: 30`, `numMaxPages: 4`

```
1. Initial load
   → getRows({ select: [], startRow: 0, endRow: 30 })
   → Server returns: 30 countries, totalRowCount: 160
   → Tree: root.pages = [page0(P: 0-29)]
   → Flatten: 30 rows, all depth-0 groups, collapsed
   → Viewmodel: L: 0-29, offsetTop: 0, offsetBottom: 130
   → Layout renders collapsed groups

2. User expands "USA" (row 0 in page0)
   → getRows({ select: ["USA"], startRow: 0, endRow: 30 })
   → Server returns: 30 years, totalRowCount: 60
   → page0.expandedRows.set(0, { totalRowCount: 60, pages: [usa_page0(P: 0-29)] })
   → Tree: root.pages = [page0], page0 → USA → [usa_page0]
   → Cache: 2 pages
   → Flatten: L0=USA, L1-30=usa_page0, L31=page0 row 1, ...
   → Total L: 160 + 60 = 220
   → Viewmodel: L: 0-89 (page0's 30 rows + USA's 60 children interleaved)
     but only usa_page0 loaded (30 of 60), so viewmodel stops at contiguity gap
   → Viewmodel: L: 0-59, offsetTop: 0, offsetBottom: 160

3. Scroll down → fetch usa_page1 (P: 30-59)
   → USA's pages: [usa_page0, usa_page1]
   → Cache: 3 pages
   → Now USA fully loaded — viewmodel extends through rest of page0
   → Viewmodel: L: 0-89, offsetTop: 0, offsetBottom: 130

4. Scroll past page0 → fetch root page1 (P: 30-59)
   → Tree: root.pages = [page0, page1]
   → Cache: 4 pages — at numMaxPages cap
   → Viewmodel: L: 0-149 (page0 + USA children + page1), contiguous

5. Scroll far to end → need root page4 (P: 120-149)
   → Not contiguous with current block
   → Evict all 4 pages (page0 eviction cascades: usa_page0, usa_page1 also evicted)
   → USA expansion state lost
   → Fetch page4
   → Cache: [page4], 1 page
   → Viewmodel: L: 120-149, offsetTop: 120, offsetBottom: 11

6. User scrolls back to top
   → Evict page4, fetch page0
   → Cache: [page0], 1 page
   → USA is no longer expanded (child pages were evicted)
   → Viewmodel: L: 0-29, all groups collapsed

7. User applies filter: sport = "Swimming"
   → Full invalidation — clear entire page tree
   → getRows({ select: [], startRow: 0, endRow: 30, filter: [...] })
   → Fresh start with filtered data
```
