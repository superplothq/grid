import React, { useEffect, useRef, useState } from "react";
import "@superplot/grid/grid.css";
import Grid, { FlattenedDataViewModel } from "@superplot/grid/renderer";

const COLUMNS = ["Ticker", "Desk", "Notional", "PnL"];
const TICKERS = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "AVGO", "ORCL"];
const DESKS = ["Cash", "Derivatives", "Prime", "Macro"];

const columnFacets: string[][] = [COLUMNS];

function randomRows(numRows: number): any[][] {
  const ticker: string[] = [];
  const desk: string[] = [];
  const notional: number[] = [];
  const pnl: number[] = [];
  for (let row = 0; row < numRows; row++) {
    ticker.push(TICKERS[Math.floor(Math.random() * TICKERS.length)]);
    desk.push(DESKS[Math.floor(Math.random() * DESKS.length)]);
    notional.push(Math.round(Math.random() * 5_000_000));
    pnl.push(Math.round((Math.random() - 0.4) * 200_000));
  }
  return [ticker, desk, notional, pnl];
}

const btnStyle: React.CSSProperties = {
  padding: "6px 12px",
  cursor: "pointer",
  border: "1px solid #ccc",
  borderRadius: 4,
  background: "#fff",
};

const BlankLoadingDemo: React.FC = () => {
  const conRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const viewModelRef = useRef<FlattenedDataViewModel | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    if (!conRef.current) return;

    // The viewmodel exists from the start with no data in it, so the first draw has something
    // to render - the loading surface - instead of throwing.
    const viewModel = FlattenedDataViewModel.createBlank();
    viewModelRef.current = viewModel;

    const grid = new Grid({ theme }, conRef.current, "flat");
    gridRef.current = grid;
    grid.data = viewModel;
    grid.draw();

    grid.on("viewDataEmpty", (payload) => {
      console.log(">>> viewDataEmpty", payload);
    });

    setLoaded(false);

    return () => {
      gridRef.current = null;
      viewModelRef.current = null;
    };
  }, [theme]);

  const loadData = (): void => {
    const numRows = 20 + Math.floor(Math.random() * 200);
    viewModelRef.current!.updateData({ data: randomRows(numRows), columnFacets });
    gridRef.current!.data = viewModelRef.current!;
    gridRef.current!.draw();
    setLoaded(true);
  };

  const backToLoading = (): void => {
    viewModelRef.current!.reset();
    gridRef.current!.draw();
    setLoaded(false);
  };

  return (
    <>
      <h2>Blank Grid Loading</h2>
      <p>
        The grid starts with a blank viewmodel. `draw()` renders the loading surface and emits
        `viewDataEmpty` with reason `no-data` instead of drawing tracks. `reset()` puts it back.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <button style={btnStyle} onClick={loadData}>
          {loaded ? "Reload random data" : "Load random data"}
        </button>
        <button style={btnStyle} onClick={backToLoading} disabled={!loaded}>
          Reset to loading
        </button>
        <button style={btnStyle} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          Theme: {theme}
        </button>
        <span style={{ fontSize: 12, color: "#666" }}>
          state: {loaded ? "loaded" : "loading"}
        </span>
      </div>

      {/* keyed by theme: attachShadow throws on an element that already hosts a shadow root,
          so switching theme has to hand the grid a fresh element */}
      <div
        key={theme}
        ref={conRef}
        style={{ width: "100%", height: 420, border: "1px solid #ddd" }}
      />
    </>
  );
};

export default BlankLoadingDemo;
