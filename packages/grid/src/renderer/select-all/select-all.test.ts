import { expect } from "chai";
import { matchesFacetPredicate, matchesAllFacetPredicates, evaluateRulesForDataCell, evaluateRulesForFacetCell } from "./evaluate";
import { SelectionRuleStore } from "./rule-store";
import { Selection } from "./selection";
import { FacetDef, FacetPredicateNode, SelectionRule } from "../types";

const makeFacetDef = (text: string): FacetDef => ({
  text,
  headerRenderer: () => "",
  trackRenderer: () => ({ content: "" }),
});

describe("matchesFacetPredicate", () => {
  const defs = [makeFacetDef("region"), makeFacetDef("city"), makeFacetDef("store")];

  it("should match at root level", () => {
    const pred = (dim: string, val: string | null) => dim === "region" && val === "East";
    expect(matchesFacetPredicate(pred, ["East", "Boston", "Downtown"], defs)).to.be.true;
  });

  it("should match at nested level", () => {
    const pred = (dim: string, val: string | null) => dim === "city" && val === "Boston";
    expect(matchesFacetPredicate(pred, ["East", "Boston", "Downtown"], defs)).to.be.true;
  });

  it("should not match when value differs", () => {
    const pred = (dim: string, val: string | null) => dim === "region" && val === "West";
    expect(matchesFacetPredicate(pred, ["East", "Boston", "Downtown"], defs)).to.be.false;
  });

  it("should provide ancestor path", () => {
    const paths: [string, string | null][][] = [];
    const pred = (dim: string, _val: string | null, path: [string, string | null][]) => {
      if (dim === "store") paths.push(path);
      return false;
    };
    matchesFacetPredicate(pred, ["East", "Boston", "Downtown"], defs);
    expect(paths).to.deep.equal([[["region", "East"], ["city", "Boston"]]]);
  });

  it("should provide empty path for root level", () => {
    const paths: [string, string | null][][] = [];
    const pred = (dim: string, _val: string | null, path: [string, string | null][]) => {
      if (dim === "region") paths.push(path);
      return false;
    };
    matchesFacetPredicate(pred, ["East", "Boston", "Downtown"], defs);
    expect(paths).to.deep.equal([[]]);
  });
});

describe("matchesAllFacetPredicates", () => {
  const rowDefs = [makeFacetDef("region"), makeFacetDef("city")];
  const colDefs = [makeFacetDef("year"), makeFacetDef("quarter")];

  it("should match when predicates match across different axes", () => {
    const preds: FacetPredicateNode[] = [
      { type: "facet", predicate: (dim) => dim === "region" },
      { type: "facet", predicate: (dim) => dim === "year" },
    ];
    expect(matchesAllFacetPredicates(preds, ["East", "Boston"], ["2024", "Q1"], rowDefs, colDefs)).to.be.true;
  });

  it("should fail when one predicate does not match", () => {
    const preds: FacetPredicateNode[] = [
      { type: "facet", predicate: (dim) => dim === "region" },
      { type: "facet", predicate: (dim) => dim === "nonexistent" },
    ];
    expect(matchesAllFacetPredicates(preds, ["East", "Boston"], ["2024", "Q1"], rowDefs, colDefs)).to.be.false;
  });

  it("should handle undefined paths", () => {
    const preds: FacetPredicateNode[] = [
      { type: "facet", predicate: (dim) => dim === "region" },
    ];
    expect(matchesAllFacetPredicates(preds, ["East", "Boston"], undefined, rowDefs, colDefs)).to.be.true;
    expect(matchesAllFacetPredicates(preds, undefined, ["2024", "Q1"], rowDefs, colDefs)).to.be.false;
  });
});

describe("evaluateRulesForDataCell", () => {
  const rowDefs = [makeFacetDef("region")];
  const colDefs = [makeFacetDef("year")];

  it("should return matching renderer", () => {
    const customRenderer = () => "custom";
    const rules: SelectionRule[] = [{
      id: 0,
      predicates: [{ type: "facet", predicate: (dim) => dim === "region" }, { type: "cell", predicate: () => true }],
      terminal: { type: "prop", props: { cellRenderer: customRenderer } },
    }];
    const result = evaluateRulesForDataCell(rules, ["East"], ["2024"], rowDefs, colDefs, 42);
    expect(result.effectiveRenderer).to.equal(customRenderer);
  });

  it("should collect style functions", () => {
    const styleFn = () => {};
    const rules: SelectionRule[] = [{
      id: 0,
      predicates: [{ type: "facet", predicate: (dim) => dim === "region" }, { type: "cell", predicate: () => true }],
      terminal: { type: "style", fn: styleFn },
    }];
    const result = evaluateRulesForDataCell(rules, ["East"], ["2024"], rowDefs, colDefs, 42);
    expect(result.styleFns).to.deep.equal([styleFn]);
  });

  it("should apply cell predicate filtering", () => {
    const customRenderer = () => "custom";
    const rules: SelectionRule[] = [{
      id: 0,
      predicates: [
        { type: "facet", predicate: () => true },
        { type: "cell", predicate: (v) => v > 50 },
      ],
      terminal: { type: "prop", props: { cellRenderer: customRenderer } },
    }];
    expect(evaluateRulesForDataCell(rules, ["East"], ["2024"], rowDefs, colDefs, 42).effectiveRenderer).to.be.undefined;
    expect(evaluateRulesForDataCell(rules, ["East"], ["2024"], rowDefs, colDefs, 100).effectiveRenderer).to.equal(customRenderer);
  });

  it("should use last-write-wins for renderer", () => {
    const renderer1 = () => "r1";
    const renderer2 = () => "r2";
    const rules: SelectionRule[] = [
      { id: 0, predicates: [{ type: "facet", predicate: () => true }, { type: "cell", predicate: () => true }], terminal: { type: "prop", props: { cellRenderer: renderer1 } } },
      { id: 1, predicates: [{ type: "facet", predicate: () => true }, { type: "cell", predicate: () => true }], terminal: { type: "prop", props: { cellRenderer: renderer2 } } },
    ];
    const result = evaluateRulesForDataCell(rules, ["East"], ["2024"], rowDefs, colDefs, 42);
    expect(result.effectiveRenderer).to.equal(renderer2);
  });

  it("should return matching valueFormatter", () => {
    const valueFormatter = () => "formatted";
    const rules: SelectionRule[] = [{
      id: 0,
      predicates: [{ type: "facet", predicate: (dim) => dim === "region" }, { type: "cell", predicate: () => true }],
      terminal: { type: "prop", props: { valueFormatter } },
    }];
    const result = evaluateRulesForDataCell(rules, ["East"], ["2024"], rowDefs, colDefs, 42);
    expect(result.effectiveValueFormatter).to.equal(valueFormatter);
  });

  it("should apply cell predicate filtering to valueFormatter", () => {
    const valueFormatter = () => "formatted";
    const rules: SelectionRule[] = [{
      id: 0,
      predicates: [
        { type: "facet", predicate: () => true },
        { type: "cell", predicate: (v) => v > 50 },
      ],
      terminal: { type: "prop", props: { valueFormatter } },
    }];
    expect(evaluateRulesForDataCell(rules, ["East"], ["2024"], rowDefs, colDefs, 42).effectiveValueFormatter).to.be.undefined;
    expect(evaluateRulesForDataCell(rules, ["East"], ["2024"], rowDefs, colDefs, 100).effectiveValueFormatter).to.equal(valueFormatter);
  });

  it("should use last-write-wins for valueFormatter", () => {
    const formatter1 = () => "f1";
    const formatter2 = () => "f2";
    const rules: SelectionRule[] = [
      { id: 0, predicates: [{ type: "facet", predicate: () => true }, { type: "cell", predicate: () => true }], terminal: { type: "prop", props: { valueFormatter: formatter1 } } },
      { id: 1, predicates: [{ type: "facet", predicate: () => true }, { type: "cell", predicate: () => true }], terminal: { type: "prop", props: { valueFormatter: formatter2 } } },
    ];
    const result = evaluateRulesForDataCell(rules, ["East"], ["2024"], rowDefs, colDefs, 42);
    expect(result.effectiveValueFormatter).to.equal(formatter2);
  });

  it("should resolve renderer and valueFormatter from the same rule", () => {
    const customRenderer = () => "custom";
    const valueFormatter = () => "formatted";
    const rules: SelectionRule[] = [{
      id: 0,
      predicates: [{ type: "facet", predicate: () => true }, { type: "cell", predicate: () => true }],
      terminal: { type: "prop", props: { cellRenderer: customRenderer, valueFormatter } },
    }];
    const result = evaluateRulesForDataCell(rules, ["East"], ["2024"], rowDefs, colDefs, 42);
    expect(result.effectiveRenderer).to.equal(customRenderer);
    expect(result.effectiveValueFormatter).to.equal(valueFormatter);
  });

  it("should not apply valueFormatter from rules without cell predicates", () => {
    const valueFormatter = () => "formatted";
    const rules: SelectionRule[] = [{
      id: 0,
      predicates: [{ type: "facet", predicate: () => true }],
      terminal: { type: "prop", props: { valueFormatter } },
    }];
    const result = evaluateRulesForDataCell(rules, ["East"], ["2024"], rowDefs, colDefs, 42);
    expect(result.effectiveValueFormatter).to.be.undefined;
  });
});

describe("evaluateRulesForFacetCell", () => {
  const defs = [makeFacetDef("region"), makeFacetDef("city")];

  it("should return matching track renderer", () => {
    const trackRenderer = () => ({ content: "custom" });
    const rules: SelectionRule[] = [{
      id: 0,
      predicates: [{ type: "facet", predicate: (dim) => dim === "region" }],
      terminal: { type: "prop", props: { trackRenderer } },
    }];
    const result = evaluateRulesForFacetCell(rules, ["East", "Boston"], defs);
    expect(result.effectiveTrackRenderer).to.equal(trackRenderer);
  });

  it("should skip rules with cell predicates", () => {
    const trackRenderer = () => ({ content: "custom" });
    const rules: SelectionRule[] = [{
      id: 0,
      predicates: [
        { type: "facet", predicate: () => true },
        { type: "cell", predicate: () => true },
      ],
      terminal: { type: "prop", props: { trackRenderer } },
    }];
    const result = evaluateRulesForFacetCell(rules, ["East", "Boston"], defs);
    expect(result.effectiveTrackRenderer).to.be.undefined;
  });
});

describe("SelectionRuleStore", () => {
  it("should add and remove rules", async () => {
    let callCount = 0;
    const onChange = () => { callCount++; };
    const store = new SelectionRuleStore(onChange);

    const id = store.addRule(
      [{ type: "facet", predicate: () => true }],
      { type: "prop", props: {} }
    );
    expect(store.rules).to.have.length(1);

    await Promise.resolve();
    expect(callCount).to.equal(1);

    store.removeRules([id]);
    expect(store.rules).to.have.length(0);

    await Promise.resolve();
    expect(callCount).to.equal(2);
  });

  it("should assign unique ids", () => {
    const store = new SelectionRuleStore(() => {});
    const id1 = store.addRule([], { type: "prop", props: {} });
    const id2 = store.addRule([], { type: "prop", props: {} });
    expect(id1).to.not.equal(id2);
  });

  it("should batch multiple addRule calls into single onChange", async () => {
    let callCount = 0;
    const store = new SelectionRuleStore(() => { callCount++; });

    store.addRule([], { type: "prop", props: {} });
    store.addRule([], { type: "prop", props: {} });
    store.addRule([], { type: "prop", props: {} });

    expect(callCount).to.equal(0);
    await Promise.resolve();
    expect(callCount).to.equal(1);
  });
});

describe("Selection fluent API", () => {
  it("should build predicate chain with selectAll", () => {
    const store = new SelectionRuleStore(() => {});
    const sel = new Selection(store, [{ type: "facet", predicate: () => true }]);

    const sel2 = sel.selectAll((dim) => dim === "year");
    expect(sel2.predicates).to.have.length(2);
    expect(sel2.predicates[0].type).to.equal("facet");
    expect(sel2.predicates[1].type).to.equal("facet");
  });

  it("should build predicate chain with selectAllCell", () => {
    const store = new SelectionRuleStore(() => {});
    const sel = new Selection(store, [{ type: "facet", predicate: () => true }]);

    const cellSel = sel.selectAllCell((v) => v > 50);
    expect(cellSel.predicates).to.have.length(2);
    expect(cellSel.predicates[1].type).to.equal("cell");
  });

  it("should create rules via prop() and return self for chaining", () => {
    const store = new SelectionRuleStore(() => {});
    const sel = new Selection(store, [{ type: "facet", predicate: () => true }]);

    const result = sel.prop({ cellRenderer: () => "test" });
    expect(result).to.equal(sel);
    expect(store.rules).to.have.length(1);

    result.undo();
    expect(store.rules).to.have.length(0);
  });

  it("should create rules via group() and return self for chaining", () => {
    const store = new SelectionRuleStore(() => {});
    const sel = new Selection(store, [{ type: "facet", predicate: () => true }]);

    const result = sel.group("highlight");
    expect(result).to.equal(sel);
    expect(store.rules).to.have.length(1);
    expect(store.rules[0].terminal.type).to.equal("style");

    result.undo();
    expect(store.rules).to.have.length(0);
  });

  it("should create rules via style() and return self for chaining", () => {
    const store = new SelectionRuleStore(() => {});
    const sel = new Selection(store, [{ type: "facet", predicate: () => true }]);

    const result = sel.style(() => {});
    expect(result).to.equal(sel);
    expect(store.rules).to.have.length(1);

    result.undo();
    expect(store.rules).to.have.length(0);
  });

  it("should chain prop().style().selectAllCell().prop()", () => {
    const store = new SelectionRuleStore(() => {});
    const sel = new Selection(store, [{ type: "facet", predicate: () => true }]);

    const chain = sel
      .prop({ cellRenderer: () => "r1" })
      .style(() => {})
      .selectAllCell((v) => v > 50)
      .prop({ cellRenderer: () => "r2" });

    expect(store.rules).to.have.length(3);
    chain.undo();
    expect(store.rules).to.have.length(0);
  });

  it("should share ruleIds across chained selections", () => {
    const store = new SelectionRuleStore(() => {});
    const sel = new Selection(store, [{ type: "facet", predicate: () => true }]);

    const sel2 = sel.selectAll(() => true);
    sel.prop({ cellRenderer: () => "a" });
    sel2.prop({ cellRenderer: () => "b" });

    expect(sel.ruleIds).to.equal(sel2.ruleIds);
    expect(store.rules).to.have.length(2);

    sel.undo();
    expect(store.rules).to.have.length(0);
  });

  it("should batch draw for full chain", async () => {
    let callCount = 0;
    const store = new SelectionRuleStore(() => { callCount++; });
    const sel = new Selection(store, [{ type: "facet", predicate: () => true }]);

    sel
      .prop({ cellRenderer: () => "r1" })
      .style(() => {})
      .selectAllCell((v) => v > 50)
      .prop({ cellRenderer: () => "r2" });

    expect(callCount).to.equal(0);
    await Promise.resolve();
    expect(callCount).to.equal(1);
  });
});
