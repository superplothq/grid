import React, {useEffect, useRef} from "react";
import "grid/dist/grid.css";
import Grid, {
  FlattenedDataViewModel,
  createRowMeta,
  CellRenderer,
  GridDataViewModelOptions,
  VTrackDef,
  FacetCellRenderer,
  FacetDataContext,
  FacetRendererContext,
  FacetCellContent,
} from "grid/dist/renderer";

const NUM_ROWS = 1000;
const CLIENTS = ["Barney", "Bart", "Homer", "Lisa", "Marge"];
const SUB_COLS = ["chg", "chg (-)", "chg (v)"];
const NUM_COLS = CLIENTS.length * SUB_COLS.length;
const TOTAL_ROWS = NUM_ROWS + 1;
const MAX_ABS_VALUE = 20;
const UPDATE_INTERVAL_MS = 75;

const BASE_TICKERS = [
  "BAC.N", "ORCL.N", "ADBE", "BABA.N", "AMZN.N", "GOOGL.N", "UNN.N",
  "NVDA.N", "AAPL.N", "MKE.N", "MSFT.N", "DIS.N", "JPM.N", "XOM.N",
  "FSR", "ASHL.N", "CMCSA.N", "V.N", "TH.N", "META.N", "NFLX.N",
  "TSLA.N", "AMD.N", "INTC.N", "CRM.N", "PYPL.N", "UBER.N", "SNAP.N",
  "SQ.N", "SHOP.N", "ZM.N", "COIN.N", "RIVN.N", "LCID.N", "NIO.N",
  "PLTR.N", "SOFI.N", "HOOD.N", "ABNB.N", "DASH.N", "RBLX.N", "U.N",
  "DKNG.N", "MARA.N", "RIOT.N", "HIMS.N", "OPEN.N", "CLOV.N", "WISH.N",
  "BB.N",
];

function generateTickers(count: number): string[] {
  const tickers: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i < BASE_TICKERS.length) {
      tickers.push(BASE_TICKERS[i]);
    } else {
      tickers.push(`STK${String(i).padStart(4, "0")}.N`);
    }
  }
  return tickers;
}

const barRenderer: CellRenderer<number> = (value, _dataCtx, ctx) => {
  if (value == null) return "";
  ctx.container.style.position = "relative";
  ctx.container.style.overflow = "hidden";

  const absVal = Math.abs(value);
  const barWidth = Math.min((absVal / MAX_ABS_VALUE) * 50, 80);
  const isPositive = value >= 0;
  const barColor = isPositive ? "rgba(90,155,213,0.45)" : "rgba(224,108,117,0.45)";
  const textColor = isPositive ? "#5b9bd5" : "#e06c75";

  return (
    `<span style="position:relative;z-index:1;font-size:11px;color:${textColor}">${value.toFixed(2)}</span>` +
    `<span style="position:absolute;right:0;top:2px;bottom:2px;width:${barWidth}%;background:${barColor};border-radius:1px"></span>`
  );
};

interface ExpandCollapseState {
  expanded: boolean;
  toggle: () => void;
}

function makeFacetRenderer(state: ExpandCollapseState): FacetCellRenderer {
  return (data: string, dataCtx: FacetDataContext, rCtx: FacetRendererContext): FacetCellContent | string => {
    const flatMeta = dataCtx.flatMeta;
    if (!flatMeta || flatMeta.isLeaf) return String(data ?? "");

    const iconText = flatMeta.isExpanded ? "\u2212" : "+";
    const icon = document.createElement("span");
    icon.textContent = iconText;
    icon.style.cursor = "pointer";
    icon.style.userSelect = "none";
    icon.style.fontWeight = "bold";
    icon.style.width = "14px";
    icon.style.display = "inline-block";
    icon.style.textAlign = "center";

    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      state.toggle();
    });

    return {
      left: icon,
      content: String(data ?? ""),
    };
  };
}

const MarketMonitor: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;

    // Column facets: 2 levels
    const columnFacets: (string | null)[][] = [
      CLIENTS.flatMap(c => Array(SUB_COLS.length).fill(c)),
      Array(CLIENTS.length).fill(SUB_COLS).flat(),
    ];

    // Row setup — full dataset (always kept for mutations)
    const tickers = generateTickers(NUM_ROWS);
    const fullRowFacet: (string | null)[] = ["TOTAL", ...tickers];
    const fullRowMeta = new Uint8Array(TOTAL_ROWS);
    fullRowMeta[0] = createRowMeta(0, false, true);
    for (let i = 1; i < TOTAL_ROWS; i++) {
      fullRowMeta[i] = createRowMeta(1, true, false);
    }

    // Column-major data — full dataset (mutated in-place by the interval)
    const fullData: (number | null)[][] = [];
    for (let col = 0; col < NUM_COLS; col++) {
      const colData: (number | null)[] = new Array(TOTAL_ROWS);
      for (let row = 1; row < TOTAL_ROWS; row++) {
        colData[row] = parseFloat(((Math.random() - 0.5) * MAX_ABS_VALUE * 2).toFixed(2));
      }
      let sum = 0;
      for (let row = 1; row < TOTAL_ROWS; row++) sum += colData[row]!;
      colData[0] = parseFloat((sum / NUM_ROWS).toFixed(2));
      fullData.push(colData);
    }

    // Collapsed view: single-row arrays (TOTAL only)
    const collapsedData: (number | null)[][] = fullData.map(col => [col[0]]);
    const collapsedRowFacet: (string | null)[] = ["TOTAL"];
    const collapsedRowMeta = new Uint8Array([createRowMeta(0, false, false)]);

    const vTrackDefs: VTrackDef[] = Array.from({length: NUM_COLS}, () => ({
      renderer: barRenderer,
      colSize: {strategy: "fixed-width" as const, widthInPx: 70, minWidthInPx: 50},
    }));

    // Expand/collapse state
    const ecState: ExpandCollapseState = {
      expanded: true,
      toggle() {
        ecState.expanded = !ecState.expanded;
        if (!ecState.expanded) {
          for (let c = 0; c < NUM_COLS; c++) collapsedData[c][0] = fullData[c][0];
        }
        const vm = makeViewModel(ecState.expanded);
        grid.data = vm;
        container.scrollTop = 0;
        requestAnimationFrame(() => grid.draw());
      },
    };

    const facetRenderer = makeFacetRenderer(ecState);

    const options: GridDataViewModelOptions = {
      vTrackDefs,
      facetDefs: {
        row: [{trackRenderer: facetRenderer}],
        col: [],
        axis: "col",
      },
    };

    function makeViewModel(expanded: boolean): FlattenedDataViewModel {
      if (expanded) {
        fullRowMeta[0] = createRowMeta(0, false, true);
        return new FlattenedDataViewModel({
          data: fullData,
          columnFacets,
          rowFacet: fullRowFacet,
          rowMeta: fullRowMeta,
          options,
          totalRows: TOTAL_ROWS,
        });
      } else {
        collapsedRowMeta[0] = createRowMeta(0, false, false);
        return new FlattenedDataViewModel({
          data: collapsedData,
          columnFacets,
          rowFacet: collapsedRowFacet,
          rowMeta: collapsedRowMeta,
          options,
          totalRows: 1,
        });
      }
    }

    const grid = new Grid({theme: "light"}, container, "flat");
    grid.data = makeViewModel(true);
    grid.draw();

    // Real-time row rotation + value mutation every 45ms
    const intervalId = setInterval(() => {
      // Rotate leaf rows (indices 1..TOTAL_ROWS-1): last row wraps to position 1
      const lastLeafIdx = TOTAL_ROWS - 1;

      // Save last leaf row values across all columns + facet
      const savedVals: (number | null)[] = new Array(NUM_COLS);
      for (let col = 0; col < NUM_COLS; col++) savedVals[col] = fullData[col][lastLeafIdx];
      const savedFacet = fullRowFacet[lastLeafIdx];

      // Shift all leaf rows down by 1
      for (let row = lastLeafIdx; row > 1; row--) {
        for (let col = 0; col < NUM_COLS; col++) fullData[col][row] = fullData[col][row - 1];
        fullRowFacet[row] = fullRowFacet[row - 1];
      }

      // Place saved (last) row at position 1
      for (let col = 0; col < NUM_COLS; col++) fullData[col][1] = savedVals[col];
      fullRowFacet[1] = savedFacet;

      // Mutate all leaf row values with a small delta
      for (let row = 1; row < TOTAL_ROWS; row++) {
        for (let col = 0; col < NUM_COLS; col++) {
          const current = fullData[col][row] as number;
          const delta = (Math.random() - 0.5) * 2;
          fullData[col][row] = parseFloat(
            Math.max(-MAX_ABS_VALUE, Math.min(MAX_ABS_VALUE, current + delta)).toFixed(2),
          );
        }
      }

      // Recompute TOTAL averages
      for (let col = 0; col < NUM_COLS; col++) {
        let sum = 0;
        for (let row = 1; row < TOTAL_ROWS; row++) sum += fullData[col][row] as number;
        fullData[col][0] = parseFloat((sum / NUM_ROWS).toFixed(2));
      }

      if (!ecState.expanded) {
        for (let col = 0; col < NUM_COLS; col++) collapsedData[col][0] = fullData[col][0];
      }

      grid.scheduleDraw();
    }, UPDATE_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  return (
    <div style={{position: "relative", width: "100%", height: "calc(100vh - 80px)"}}>
      <div ref={containerRef} style={{position: "absolute", top: 0, left: 0, right: 0, bottom: 0}} />
    </div>
  );
};

export default MarketMonitor;
