import Grid, { FlattenedDataViewModel } from "grid/dist/renderer";
import type { CellRenderer, RendererContext } from "grid/dist/renderer";
import type { FlattenedDataViewModelParams } from "grid/dist/renderer/flattened-data-viewmodel";
import { createGridMount } from "../../runtime/mount";
import { syncGridTheme } from "../../runtime/theme";
import { createToolbar, toolbarButton } from "../../runtime/toolbar";
import type { SampleContext, SampleRow } from "../../types";

interface Column {
  field: string;
  label: string;
  kind: "text" | "money";
}

const COLUMNS: Column[] = [
  { field: "title_description", label: "Title", kind: "text" },
  { field: "agency_name", label: "Agency", kind: "text" },
  { field: "work_location_borough", label: "Borough", kind: "text" },
  { field: "base_salary", label: "Base Salary", kind: "money" },
  { field: "total_ot_paid", label: "OT Paid", kind: "money" },
];

const PAGE_SIZE = 10;

// The grid does not page for you: the viewmodel only ever holds the rows you give
// it. Here the glue keeps a page index on `viewModel.metaState` and feeds one page
// of rows at a time. A server-backed DataModel does the same thing over the wire -
// it reports the full `totalRows` and windows the loaded block with `offsetTop`.
export function mount(el: HTMLElement, ctx: SampleContext): () => void {
  const toolbar = createToolbar();
  toolbar.style.alignSelf = "flex-end";
  const prev = toolbarButton("Prev");
  const next = toolbarButton("Next");
  const label = document.createElement("span");
  label.style.cssText = "font-size:12px;opacity:0.75;min-width:100px;text-align:center;";
  toolbar.append(prev, label, next);

  const gridMount = createGridMount(el, 420);
  const grid = new Grid({}, gridMount, "flat");
  const disposeTheme = syncGridTheme(grid);
  el.append(toolbar, gridMount);

  let viewModel: FlattenedDataViewModel;
  let allRows: SampleRow[] = [];
  let disposed = false;

  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));

  ctx.loadDataset("payroll").then((rows) => {
    if (disposed) return;
    allRows = rows;
    viewModel = new FlattenedDataViewModel(buildParams(pageRows(0)));
    viewModel.metaState.set("page", "index", 0);
    grid.data = viewModel;
    grid.draw();
    updateControls();
  });

  return () => {
    disposed = true;
    disposeTheme();
    el.removeChild(toolbar);
    el.removeChild(gridMount);
  };

  // Move by one page, clamped to the available range. The page index is the only
  // state - the render slices that page out of the full row set.
  function step(delta: number): void {
    const index = viewModel.metaState.get("page")!.index as number;
    const clamped = Math.min(Math.max(index + delta, 0), pageCount() - 1);
    if (clamped === index) return;
    viewModel.metaState.set("page", "index", clamped);
    viewModel.updateData(buildParams(pageRows(clamped)));
    grid.draw();
    updateControls();
  }

  function updateControls(): void {
    const index = viewModel.metaState.get("page")!.index as number;
    label.textContent = `Page ${index + 1} of ${pageCount()}`;
    prev.disabled = index === 0;
    next.disabled = index >= pageCount() - 1;
  }

  function pageRows(index: number): SampleRow[] {
    return allRows.slice(index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE);
  }

  function pageCount(): number {
    return Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
  }

  function buildParams(rows: SampleRow[]): FlattenedDataViewModelParams {
    return {
      data: COLUMNS.map((column) => rows.map((row) => row[column.field] ?? null)),
      columnFacets: [COLUMNS.map((column) => column.label)],
      totalRows: rows.length,
      options: {
        vTrackDefs: COLUMNS.map((column) => ({
          colSize: { strategy: "static" as const, width: 1, unit: "fr" as const },
          valueFormatter: column.kind === "money" ? formatMoney : undefined,
          renderer: column.kind === "money" ? rightAlignValue : undefined,
        })),
        facetDefs: { row: [], col: [{}], axis: "col" as const },
      },
    };
  }
}

/* ===================================== utils ===================================== */

const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatMoney(value: unknown): string {
  return typeof value === "number" ? moneyFormatter.format(value) : "";
}

const rightAlignValue: CellRenderer<string> = (data, _dataCtx, ctx: RendererContext) => {
  const cell = ctx.container;
  cell.style.justifyContent = "flex-end";
  cell.style.padding = "calc(var(--cell-padding-y) * 1px) calc(var(--cell-padding-x) * 1px)";
  cell.style.fontVariantNumeric = "tabular-nums";
  return data == null ? "" : String(data);
};
