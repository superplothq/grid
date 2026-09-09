import { expect } from "chai";
import {
  resolveCellTarget,
  hoverRectsFor,
  defaultHoverStyleRenderer,
  cellTargetKey,
  CellPointerTracker,
  CellEventPayload,
  CellTarget,
} from "./cell-events";

const facets = {
  // level-major
  rowFacets: [
    ["N", "N", "N", "S", "S"],
    ["a", "a", "b", "b", "c"],
  ],
  columnFacets: [
    ["2023", "2023", "2024", "2024"],
    ["Q1", "Q2", "Q1", "Q2"],
  ],
};

describe("#resolveCellTarget", () => {
  it("CASE: value cell", () => {
    expect(resolveCellTarget({ dataset: { cellType: "value", row: "3", col: "1" } }, facets))
      .to.deep.equal({ cellType: "value", row: 3, col: 1 });
  });

  it("CASE: row facet resolves its full span from the start row", () => {
    expect(resolveCellTarget({ dataset: { cellType: "row-facet", level: "0", row: "1" } }, facets))
      .to.deep.equal({ cellType: "row-facet", level: 0, row: 0, toRow: 2 });
    expect(resolveCellTarget({ dataset: { cellType: "row-facet", level: "1", row: "3" } }, facets))
      .to.deep.equal({ cellType: "row-facet", level: 1, row: 3, toRow: 3 });
  });

  it("CASE: column facet resolves its full span from the rightmost col", () => {
    expect(resolveCellTarget({ dataset: { cellType: "column-facet", level: "0", col: "1" } }, facets))
      .to.deep.equal({ cellType: "column-facet", level: 0, col: 0, toCol: 1 });
    expect(resolveCellTarget({ dataset: { cellType: "column-facet", level: "1", col: "2" } }, facets))
      .to.deep.equal({ cellType: "column-facet", level: 1, col: 2, toCol: 2 });
  });

  it("CASE: header and fixture cells", () => {
    expect(resolveCellTarget({ dataset: { cellType: "header", level: "1", trackIndex: "2" } }, facets))
      .to.deep.equal({ cellType: "header", level: 1, trackIndex: 2 });
    expect(resolveCellTarget({ dataset: { cellType: "fixture", fixtureSide: "left", fixtureIndex: "0", row: "7" } }, facets))
      .to.deep.equal({ cellType: "fixture", side: "left", index: 0, row: 7 });
    expect(resolveCellTarget({ dataset: { cellType: "fixture", fixtureSide: "top", fixtureIndex: "1", col: "4" } }, facets))
      .to.deep.equal({ cellType: "fixture", side: "top", index: 1, col: 4 });
  });
});

describe("#cellTargetKey", () => {
  it("CASE: one readable key per target", () => {
    expect(cellTargetKey({ cellType: "value", row: 3, col: 1 })).to.equal("value:3:1");
    expect(cellTargetKey({ cellType: "row-facet", level: 0, row: 5, toRow: 9 })).to.equal("row-facet:0:5");
    expect(cellTargetKey({ cellType: "column-facet", level: 1, col: 7, toCol: 7 })).to.equal("column-facet:1:7");
    expect(cellTargetKey({ cellType: "header", level: 0, trackIndex: 2 })).to.equal("header:0:2");
    expect(cellTargetKey({ cellType: "fixture", side: "left", index: 0, row: 12 })).to.equal("fixture:left:0:12");
    expect(cellTargetKey({ cellType: "fixture", side: "top", index: 1, col: 4 })).to.equal("fixture:top:1:4");
  });
});

describe("#hoverRectsFor", () => {
  const value: CellTarget = { cellType: "value", row: 2, col: 5 };

  it("CASE: value cell follows the effect mode", () => {
    expect(hoverRectsFor(value, "row")).to.deep.equal([{ rows: [2, 2], source: value }]);
    expect(hoverRectsFor(value, "column")).to.deep.equal([{ cols: [5, 5], source: value }]);
    expect(hoverRectsFor(value, "cross")).to.deep.equal([{ rows: [2, 2], source: value }, { cols: [5, 5], source: value }]);
    expect(hoverRectsFor(value, "cell")).to.deep.equal([{ rows: [2, 2], cols: [5, 5], source: value }]);
  });

  it("CASE: facet cells cover their span regardless of mode", () => {
    const rowFacet: CellTarget = { cellType: "row-facet", level: 0, row: 0, toRow: 2 };
    expect(hoverRectsFor(rowFacet, "column")).to.deep.equal([{ rows: [0, 2], source: rowFacet }]);
    const colFacet: CellTarget = { cellType: "column-facet", level: 0, col: 0, toCol: 1 };
    expect(hoverRectsFor(colFacet, "row")).to.deep.equal([{ cols: [0, 1], source: colFacet }]);
  });

  it("CASE: header and fixture cells produce no hover", () => {
    expect(hoverRectsFor({ cellType: "header", level: 0, trackIndex: 0 }, "cross")).to.equal(null);
    expect(hoverRectsFor({ cellType: "fixture", side: "left", index: 0, row: 1 }, "cross")).to.equal(null);
  });
});

describe("#defaultHoverStyleRenderer", () => {
  const ctx = { viewport: { x0: 10, x1: 20, y0: 100, y1: 110 }, gridId: "7", numRowFacetLevels: 2, numColFacetLevels: 3 };

  it("CASE: clips row selectors to the viewport", () => {
    const css = defaultHoverStyleRenderer([{ rows: [95, 102] }], ctx);
    expect(css).to.include("[data-row=\"100\"]");
    expect(css).to.include("[data-row=\"102\"]");
    expect(css).to.not.include("[data-row=\"99\"]");
    expect(css).to.not.include("[data-row=\"103\"]");
    expect(css).to.include("[data-grid-id=\"7\"]");
  });

  it("CASE: emits nothing when the span is outside the viewport", () => {
    expect(defaultHoverStyleRenderer([{ cols: [0, 5] }], ctx)).to.equal("");
    expect(defaultHoverStyleRenderer([{ rows: [101, 101], cols: [0, 5] }], ctx)).to.equal("");
  });

  it("CASE: a rectangle bounded on both axes matches only the intersection", () => {
    const css = defaultHoverStyleRenderer([{ rows: [101, 102], cols: [12, 12], source: { cellType: "value", row: 101, col: 12 } }], ctx);
    expect(css).to.include("[data-cell-type=\"value\"][data-row=\"101\"][data-col=\"12\"]");
    expect(css).to.include("[data-cell-type=\"value\"][data-row=\"102\"][data-col=\"12\"]");
    expect(css).to.not.include("row-facet");
    expect(css).to.not.include("col-facet");
    expect(css).to.not.include("fixture");
  });

  it("CASE: a cross is two rectangles and matches leaf facets only", () => {
    const source: CellTarget = { cellType: "value", row: 101, col: 12 };
    const css = defaultHoverStyleRenderer([{ rows: [101, 101], source }, { cols: [12, 12], source }], ctx);
    expect(css).to.include("[data-cell-type=\"value\"][data-row=\"101\"]");
    expect(css).to.include("[data-cell-type=\"value\"][data-col=\"12\"]");
    expect(css).to.include(".row-facet.facet-r-edge[data-row=\"101\"]");
    expect(css).to.include(".col-facet.facet-b-edge[data-col=\"12\"]");
    expect(css).to.not.include("[data-level=");
  });

  it("CASE: facet hover matches every level from the hovered facet down to the leaf", () => {
    const css = defaultHoverStyleRenderer([{ cols: [15, 30], source: { cellType: "column-facet", level: 1, col: 15, toCol: 30 } }], ctx);
    expect(css).to.include("[data-cell-type=\"column-facet\"][data-level=\"1\"][data-col=\"19\"]");
    expect(css).to.include("[data-cell-type=\"column-facet\"][data-level=\"2\"][data-col=\"17\"]");
    expect(css).to.not.include("[data-level=\"0\"]");
    const rowCss = defaultHoverStyleRenderer([{ rows: [90, 105], source: { cellType: "row-facet", level: 0, row: 90, toRow: 105 } }], ctx);
    expect(rowCss).to.include("[data-cell-type=\"row-facet\"][data-level=\"0\"][data-row=\"100\"]");
    expect(rowCss).to.include("[data-cell-type=\"row-facet\"][data-level=\"1\"][data-row=\"105\"]");
  });
});

describe("CellPointerTracker", () => {
  type FakeCell = { dataset: Record<string, string> };
  const cellA = { dataset: { cellType: "value", row: "1", col: "1" } } as unknown as HTMLElement;
  const cellB = { dataset: { cellType: "value", row: "2", col: "1" } } as unknown as HTMLElement;
  const evt = { clientX: 5, clientY: 5, target: null } as unknown as MouseEvent;
  const at = (target: HTMLElement | null) => ({ ...evt, target }) as MouseEvent;

  function setup(opts?: { click?: boolean; elementAt?: () => HTMLElement | null }) {
    const log: string[] = [];
    const active = { hover: true };
    const tracker = new CellPointerTracker({
      resolve: (cell) => resolveCellTarget(cell as unknown as FakeCell, facets),
      cellFromTarget: (t) => t as HTMLElement | null,
      elementAt: opts?.elementAt ?? (() => null),
      hoverActive: () => active.hover,
      clickActive: () => opts?.click ?? true,
      onOver: (p: CellEventPayload) => log.push(`over:${(p as { row: number }).row}`),
      onOut: (p: CellEventPayload) => log.push(`out:${(p as { row: number }).row}`),
      onClick: (p: CellEventPayload) => log.push(`click:${(p as { row: number }).row}`),
    });
    return { tracker, log, active };
  }

  it("CASE: emits once per cell transition", () => {
    const { tracker, log } = setup();
    tracker.handleMove(at(cellA));
    tracker.handleMove(at(cellA));
    tracker.handleMove(at(cellB));
    tracker.handleLeave(evt);
    expect(log).to.deep.equal(["over:1", "out:1", "over:2", "out:2"]);
  });

  it("CASE: moves within the same element do not resolve again", () => {
    let resolves = 0;
    const log: string[] = [];
    const tracker = new CellPointerTracker({
      resolve: (cell) => { resolves++; return resolveCellTarget(cell as unknown as FakeCell, facets); },
      cellFromTarget: (t) => t as HTMLElement | null,
      elementAt: () => null,
      hoverActive: () => true,
      clickActive: () => true,
      onOver: (p: CellEventPayload) => log.push(`over:${(p as { row: number }).row}`),
      onOut: () => {},
      onClick: () => {},
    });
    tracker.handleMove(at(cellA));
    tracker.handleMove(at(cellA));
    tracker.handleMove(at(cellA));
    expect(resolves).to.equal(1);
    expect(log).to.deep.equal(["over:1"]);
  });

  it("CASE: refresh re-resolves a recycled element that now holds another cell", () => {
    const cell = { dataset: { cellType: "value", row: "1", col: "1" } } as unknown as HTMLElement;
    const { tracker, log } = setup({ elementAt: () => cell });
    tracker.handleMove(at(cell));
    cell.dataset.row = "9";
    tracker.refresh();
    expect(log).to.deep.equal(["over:1", "out:1", "over:9"]);
  });

  it("CASE: no emission while hover is inactive", () => {
    const { tracker, log, active } = setup();
    active.hover = false;
    tracker.handleMove(at(cellA));
    expect(log).to.deep.equal([]);
  });

  it("CASE: click resolves the cell, and the click after a drag is swallowed", () => {
    const { tracker, log } = setup();
    tracker.handleClick(at(cellA));
    tracker.suppressNextClick();
    tracker.handleClick(at(cellA));
    tracker.handleClick(at(cellB));
    expect(log).to.deep.equal(["click:1", "click:2"]);
  });

  it("CASE: inactive moves only record the position, refresh once active re-resolves under it", () => {
    const { tracker, log, active } = setup({ elementAt: () => cellB });
    tracker.handleMove(at(cellA));
    active.hover = false;
    tracker.handleMove(at(cellB));
    expect(log).to.deep.equal(["over:1"]);
    active.hover = true;
    tracker.refresh();
    expect(log).to.deep.equal(["over:1", "out:1", "over:2"]);
  });

  it("CASE: refresh when the cell did not change emits nothing", () => {
    const { tracker, log } = setup({ elementAt: () => cellA });
    tracker.handleMove(at(cellA));
    tracker.refresh();
    expect(log).to.deep.equal(["over:1"]);
  });

  it("CASE: leaving the grid while inactive still emits out", () => {
    const { tracker, log, active } = setup();
    tracker.handleMove(at(cellA));
    active.hover = false;
    tracker.handleLeave(evt);
    expect(log).to.deep.equal(["over:1", "out:1"]);
  });
});
