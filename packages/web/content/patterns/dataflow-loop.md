---
id: dataflow-loop
intent: Data moves one way - the ViewModel is fed to the grid, and on interaction it is the ViewModel that gets updated, never the grid, with a redraw following.
---

```ts
// Init - each core component is created once. The datasource is injected into the
// datamodel and the viewmodel into the grid; the datamodel and the viewmodel are
// never connected to each other, this code carries the data across. The classes
// below serve a standard table off a REST server; use the instances the app calls
// for instead (DuckDBWasmDataSource for in-browser SQL, GraphQLApiDataSource for a
// GraphQL server, ApiPivotTableDataModel with PivotDataViewModel for a pivot).

// the grid comes first - it draws whatever viewmodel it is handed
const grid = new Grid({}, mountEl, "flat");

// the viewmodel starts empty: one empty array per column, and totalRows so the
// grid knows how far it can scroll before any row has arrived
const viewModel = new FlattenedDataViewModel({
  data: [[], [], []],
  columnFacets: [["country", "city", "revenue"]],
  totalRows,
  offsetTop: 0,
});

// the first draw renders the frame with no rows in it, which is what asks for data
grid.data = viewModel;
grid.draw();

// the datasource reaches the server, carrying the IR the datamodel prepared and
// returning the data back. No endpoints are configured here, so it uses the
// defaults (POST to /rows, /range, /pivot and /facets under baseUrl) - pass
// buildRequest to send them somewhere else
const source = new RestApiDataSource({ baseUrl: "/api/grid" });

// the datamodel owns the transformation and is handed the datasource
const model = new ApiStandardTableDataModel(schema, source);

// the IR describes the whole fetch - grouping, projection, sort, filter. The row
// range is filled in per request, from the event
let ir: StandardDataFetchAndTransformIR = {
  startRow: 0,
  endRow: 0,
  groupPath: [],
  groupBy: ["country"],
  project: ["country", "city", "revenue"],
  sort: [{ field: "revenue", direction: "desc" }],
  filter: [],
};

// how many rows one request pulls - the whole page on the initial fill, the floor
// on a scroll so a short viewport still fetches a usable block
const ROW_SPAN = 200;

// one listener serves both the initial fill and every scroll after it, and reason
// decides which range to ask for
grid.on("viewDataEmpty", async ({ startRow, endRow, reason }) => {
  if (reason === "no-data") {
    // the empty viewmodel asking to be filled - the reported range says nothing
    // useful yet, so fetch a fixed first block
    ir = { ...ir, startRow: 0, endRow: ROW_SPAN };
  } else {
    // scrolled past the block the viewmodel holds - start where the viewport
    // starts, and never ask for fewer than ROW_SPAN rows
    ir = { ...ir, startRow, endRow: Math.max(endRow, startRow + ROW_SPAN) };
  }
  // ask the datamodel for the data that IR now describes
  const nextParams = await model.getViewModelData(ir);
  // same viewmodel instance, new data
  viewModel.updateData(nextParams);
  // nothing renders until draw
  grid.draw();
});

// Teardown - refcounted. A no-op for HTTP sources, frees the connection for DuckDB.
await source.release();
```
