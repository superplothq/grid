/* eslint-disable quotes */
import { expect } from "chai";
import { concat, cross, hierarchy } from "./grid-datamodel";
import { makeModel, makePatchedModel } from "./datamodel.data.test";
import { AxisExpr, PivotConfig, ProjectionState } from "./types";
import { GridDataViewModel } from "./renderer/grid-data-viewmodel";

const facetMeta = (vm: GridDataViewModel) => ({
  row: vm.facetDefs.row.map(d => d.meta).filter(m => m !== undefined),
  col: vm.facetDefs.col.map(d => d.meta).filter(m => m !== undefined),
});

describe("Simple operator in pivot", () => {
  describe("rows=region, columns=cross(department, revenue)", () => {
    const simplePivotConfig: PivotConfig = {
      rows: "region",
      columns: cross("department", "revenue"),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(simplePivotConfig.rows as AxisExpr);
      const colIR = model.buildAxisIR(simplePivotConfig.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "simple", field: "region" },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "cross", children: [{ type: "simple", field: "department" }] },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(simplePivotConfig);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
        + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
        + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)`
        + `\nSELECT __d__2."region", __d__2."department", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__2`
        + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND T."department" = __d__2."department"`
        + ` GROUP BY __d__2."region", __d__2."department"`
        + ` ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(simplePivotConfig);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
        ["revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [8150, 5650],
        [1670, 1730],
      ]);
      expect(facetMeta(vm)).to.deep.equal({
        row: [{ projectionState: ProjectionState.PROJECTION_NOT_CONFIGURED, projectedValues: new Set() }],
        col: [{ projectionState: ProjectionState.PROJECTION_NOT_CONFIGURED, projectedValues: new Set() }],
      });
    });
  });

  describe("rows=hierarchy(region, country), columns=cross(hierarchy(department, product, channel), revenue) [Hierarchy on both axes]", () => {
    const config: PivotConfig = {
      rows: hierarchy("region", "country"),
      columns: cross(hierarchy("department", "product", "channel"), "revenue"),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "hierarchy", fields: ["region", "country"] },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "cross", children: [{ type: "hierarchy", fields: ["department", "product", "channel"] }] },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", "country", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country"),`
        + `\n     __d__1 AS (SELECT "department", "product", "channel", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product", "channel"),`
        + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)`
        + `\nSELECT __d__2."region", __d__2."country", __d__2."department", __d__2."product", __d__2."channel", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__2`
        + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND T."country" = __d__2."country" AND T."department" = __d__2."department" AND T."product" = __d__2."product" AND T."channel" = __d__2."channel"`
        + ` GROUP BY __d__2."region", __d__2."country", __d__2."department", __d__2."product", __d__2."channel"`
        + ` ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe"],
        ["USA", "Canada", "UK", "Germany"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Apparel", "Apparel", "Apparel", "Electronics", "Apparel", "Apparel", "Electronics", "Apparel", "Electronics"],
        ["Laptop", "Phone", "Jacket", "Jacket", "Shoes", "Phone", "Shoes", "Shoes", "Phone", "Jacket", "Laptop"],
        ["Online", "Retail", "Online", "Retail", "Online", "Online", "Wholesale", "Retail", "Wholesale", "Wholesale", "Retail"],
        ["revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [3800, 1000, 1400, 1300],
        [1700, null, 850, null],
        [300, null, 400, null],
        [350, 280, 380, 350],
        [250, null, null, 280],
        [950, 700, null, null],
        [null, 200, null, null],
        [null, null, 320, null],
        [null, null, null, 750],
        [290, null, null, null],
        [null, null, null, 1350],
      ]);
      const NC = ProjectionState.PROJECTION_NOT_CONFIGURED;
      expect(facetMeta(vm)).to.deep.equal({
        row: [
          { projectionState: NC, projectedValues: new Set() },
          { projectionState: NC, projectedValues: new Set() },
        ],
        col: [
          { projectionState: NC, projectedValues: new Set() },
          { projectionState: NC, projectedValues: new Set() },
          { projectionState: NC, projectedValues: new Set() },
        ],
      });
    });
  });

  describe("rows=cross(region, department), columns=cross(channel, revenue) [Cross with null combos]", () => {
    const config: PivotConfig = {
      rows: cross("region", "department"),
      columns: cross("channel", "revenue"),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "cross", children: [{ type: "simple", field: "region" }, { type: "simple", field: "department" }] },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "cross", children: [{ type: "simple", field: "channel" }] },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
        + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
        + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1),`
        + `\n     __d__3 AS (SELECT "channel", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "channel"),`
        + `\n     __d__4 AS (SELECT * FROM __d__2 CROSS JOIN __d__3)`
        + `\nSELECT __d__4."region", __d__4."department", __d__4."channel", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__4`
        + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND T."department" = __d__4."department" AND T."channel" = __d__4."channel"`
        + ` GROUP BY __d__4."region", __d__4."department", __d__4."channel"`
        + ` ORDER BY MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__3")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe"],
        ["Electronics", "Apparel", "Electronics", "Apparel"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Online", "Retail", "Wholesale"],
        ["revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [6450, 550, 2700, 680],
        [1700, 630, 2200, 1050],
        [null, 490, 750, null],
      ]);
    });
  });

  describe("rows=region, columns=cross(concat(department, channel), revenue) [Concat on columns]", () => {
    const config: PivotConfig = {
      rows: "region",
      columns: cross(concat("department", "channel"), "revenue"),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "simple", field: "region" },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "cross", children: [{ type: "concat", children: [{ type: "simple", field: "department" }, { type: "simple", field: "channel" }] }] },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
        + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
        + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
        + `\n     __d__3 AS (`
        + `\n       SELECT '0:department' AS "__src__0", __d__1."department" AS "__c__0", __ord__1 AS "__cord__0_0" FROM __d__1`
        + `\n       UNION ALL`
        + `\n       SELECT '1:channel' AS "__src__0", __d__2."channel" AS "__c__0", __ord__2 AS "__cord__0_0" FROM __d__2`
        + `\n     ),`
        + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
        + `\nSELECT __d__4."region", __d__4."__c__0", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__4`
        + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (`
        + `\n    (__d__4."__src__0" = '0:department' AND T."department" = __d__4."__c__0")`
        + `\n    OR (__d__4."__src__0" = '1:channel' AND T."channel" = __d__4."__c__0")`
        + `\n    OR __d__4."__src__0" IS NULL`
        + `\n  )`
        + ` GROUP BY __d__4."region", __d__4."__c__0", __d__4."__src__0"`
        + ` ORDER BY MIN(__d__4."__ord__0"), __d__4."__src__0", MIN(__d__4."__cord__0_0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel", "Online", "Retail", "Wholesale"],
        ["revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [8150, 5650],
        [1670, 1730],
        [7000, 3380],
        [2330, 3250],
        [490, 750],
      ]);
    });
  });

  describe("rows=concat(region, department), columns=cross(concat(channel, quarter), revenue) [Concat on both axes]", () => {
    const config: PivotConfig = {
      rows: concat("region", "department"),
      columns: cross(concat("channel", "quarter"), "revenue"),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "concat", children: [{ type: "simple", field: "region" }, { type: "simple", field: "department" }] },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "cross", children: [{ type: "concat", children: [{ type: "simple", field: "channel" }, { type: "simple", field: "quarter" }] }] },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
        + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
        + `\n     __d__2 AS (`
        + `\n       SELECT '0:region' AS "__src__0", __d__0."region" AS "__c__0", __ord__0 AS "__cord__0_0" FROM __d__0`
        + `\n       UNION ALL`
        + `\n       SELECT '1:department' AS "__src__0", __d__1."department" AS "__c__0", __ord__1 AS "__cord__0_0" FROM __d__1`
        + `\n     ),`
        + `\n     __d__3 AS (SELECT "channel", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "channel"),`
        + `\n     __d__4 AS (SELECT "quarter", MIN(rowid) AS "__ord__4" FROM "data" GROUP BY "quarter"),`
        + `\n     __d__5 AS (`
        + `\n       SELECT '0:channel' AS "__src__1", __d__3."channel" AS "__c__1", __ord__3 AS "__cord__1_0" FROM __d__3`
        + `\n       UNION ALL`
        + `\n       SELECT '1:quarter' AS "__src__1", __d__4."quarter" AS "__c__1", __ord__4 AS "__cord__1_0" FROM __d__4`
        + `\n     ),`
        + `\n     __d__6 AS (SELECT * FROM __d__2 CROSS JOIN __d__5)`
        + `\nSELECT __d__6."__c__0", __d__6."__c__1", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__6`
        + `\nLEFT JOIN "data" T ON (`
        + `\n    (__d__6."__src__0" = '0:region' AND T."region" = __d__6."__c__0" AND __d__6."__src__1" = '0:channel' AND T."channel" = __d__6."__c__1")`
        + `\n    OR (__d__6."__src__0" = '0:region' AND T."region" = __d__6."__c__0" AND __d__6."__src__1" = '1:quarter' AND T."quarter" = __d__6."__c__1")`
        + `\n    OR (__d__6."__src__0" = '1:department' AND T."department" = __d__6."__c__0" AND __d__6."__src__1" = '0:channel' AND T."channel" = __d__6."__c__1")`
        + `\n    OR (__d__6."__src__0" = '1:department' AND T."department" = __d__6."__c__0" AND __d__6."__src__1" = '1:quarter' AND T."quarter" = __d__6."__c__1")`
        + `\n    OR (__d__6."__src__0" IS NULL AND __d__6."__src__1" IS NULL)`
        + `\n  )`
        + ` GROUP BY __d__6."__c__0", __d__6."__c__1", __d__6."__src__0", __d__6."__src__1"`
        + ` ORDER BY __d__6."__src__0", MIN(__d__6."__cord__0_0"), __d__6."__src__1", MIN(__d__6."__cord__1_0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe", "Electronics", "Apparel"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Online", "Retail", "Wholesale", "Q1", "Q2", "Q3"],
        ["revenue", "revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [7000, 3380, 9150, 1230],
        [2330, 3250, 3900, 1680],
        [490, 750, 750, 490],
        [4930, 3900, 7650, 1180],
        [3650, 1750, 3850, 1550],
        [1240, 1730, 2300, 670],
      ]);
    });
  });

  describe("rows=region, columns=cross(department, channel, quarter, revenue) [4-way cross on columns]", () => {
    const config: PivotConfig = {
      rows: "region",
      columns: cross("department", "channel", "quarter", "revenue"),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "simple", field: "region" },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: {
          type: "cross",
          children: [
            { type: "simple", field: "department" },
            { type: "simple", field: "channel" },
            { type: "simple", field: "quarter" },
          ],
        },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
        + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
        + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
        + `\n     __d__3 AS (SELECT "quarter", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "quarter"),`
        + `\n     __d__4 AS (SELECT * FROM __d__1 CROSS JOIN __d__2 CROSS JOIN __d__3),`
        + `\n     __d__5 AS (SELECT * FROM __d__0 CROSS JOIN __d__4)`
        + `\nSELECT __d__5."region", __d__5."department", __d__5."channel", __d__5."quarter", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__5`
        + `\nLEFT JOIN "data" T ON T."region" = __d__5."region" AND T."department" = __d__5."department" AND T."channel" = __d__5."channel" AND T."quarter" = __d__5."quarter"`
        + ` GROUP BY __d__5."region", __d__5."department", __d__5."channel", __d__5."quarter"`
        + ` ORDER BY MIN(__d__5."__ord__0"), MIN(__d__5."__ord__1"), MIN(__d__5."__ord__2"), MIN(__d__5."__ord__3")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Apparel", "Apparel", "Apparel", "Apparel", "Apparel", "Apparel", "Apparel", "Apparel", "Apparel"],
        ["Online", "Online", "Online", "Retail", "Retail", "Retail", "Wholesale", "Wholesale", "Wholesale", "Online", "Online", "Online", "Retail", "Retail", "Retail", "Wholesale", "Wholesale", "Wholesale"],
        ["Q1", "Q2", "Q3", "Q1", "Q2", "Q3", "Q1", "Q2", "Q3", "Q1", "Q2", "Q3", "Q1", "Q2", "Q3", "Q1", "Q2", "Q3"],
        ["revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [3300, 2700],
        [2200, null],
        [950, null],
        [800, 850],
        [900, null],
        [null, 1350],
        [null, null],
        [null, 750],
        [null, null],
        [550, null],
        [null, 680],
        [null, null],
        [280, 350],
        [350, 320],
        [null, 380],
        [null, null],
        [200, null],
        [290, null],
      ]);
    });
  });

  describe("rows=cross(region, revenue), columns=department [Measure on row]", () => {
    const config: PivotConfig = {
      rows: cross("region", "revenue"),
      columns: "department",
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "cross", children: [{ type: "simple", field: "region" }] },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "simple", field: "department" },
        measures: [],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
        + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
        + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)`
        + `\nSELECT __d__2."region", __d__2."department", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__2`
        + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND T."department" = __d__2."department"`
        + ` GROUP BY __d__2."region", __d__2."department"`
        + ` ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
        ["revenue", "revenue"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [8150, 5650],
        [1670, 1730],
      ]);
    });
  });

  describe("rows=concat(revenue, cost), columns=department [Measure-only row axis]", () => {
    const config: PivotConfig = {
      rows: concat("revenue", "cost"),
      columns: "department",
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "none" },
        measures: [{ field: "revenue", aggregation: "sum" }, { field: "cost", aggregation: "sum" }],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "simple", field: "department" },
        measures: [],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "department", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "department")`
        + `\nSELECT __d__0."department", SUM(T."revenue") AS "revenue", SUM(T."cost") AS "cost"`
        + `\nFROM __d__0`
        + `\nLEFT JOIN "data" T ON T."department" = __d__0."department"`
        + ` GROUP BY __d__0."department"`
        + ` ORDER BY MIN(__d__0."__ord__0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["revenue", "cost"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [13800, 9060],
        [3400, 1685],
      ]);
      expect(facetMeta(vm)).to.deep.equal({
        row: [],
        col: [{ projectionState: ProjectionState.PROJECTION_NOT_CONFIGURED, projectedValues: new Set() }],
      });
    });
  });

  describe("rows=region, columns=concat(revenue, cost) [Measure-only column axis]", () => {
    const config: PivotConfig = {
      rows: "region",
      columns: concat("revenue", "cost"),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "simple", field: "region" },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "none" },
        measures: [{ field: "revenue", aggregation: "sum" }, { field: "cost", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region")`
        + `\nSELECT __d__0."region", SUM(T."revenue") AS "revenue", SUM(T."cost") AS "cost"`
        + `\nFROM __d__0`
        + `\nLEFT JOIN "data" T ON T."region" = __d__0."region"`
        + ` GROUP BY __d__0."region"`
        + ` ORDER BY MIN(__d__0."__ord__0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["revenue", "cost"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [9820, 7380],
        [6160, 4585],
      ]);
    });
  });
});

describe("Operator edge cases", () => {
  describe("rows=hierarchy(region, country, city), columns=revenue [Single measure in column]", () => {
    const config: PivotConfig = {
      rows: hierarchy("region", "country", "city"),
      columns: "revenue",
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "hierarchy", fields: ["region", "country", "city"] },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "none" },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", "country", "city", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country", "city")`
        + `\nSELECT __d__0."region", __d__0."country", __d__0."city", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__0`
        + `\nLEFT JOIN "data" T ON T."region" = __d__0."region" AND T."country" = __d__0."country" AND T."city" = __d__0."city"`
        + ` GROUP BY __d__0."region", __d__0."country", __d__0."city"`
        + ` ORDER BY MIN(__d__0."__ord__0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "North America", "Europe", "Europe"],
        ["USA", "USA", "Canada", "UK", "Germany"],
        ["New York", "Chicago", "Toronto", "London", "Berlin"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [5100, 2540, 2180, 3350, 4030],
      ]);
    });
  });

  describe("rows=cross(revenue, cost), columns=concat(department, channel) [Multiple measures in row]", () => {
    const config: PivotConfig = {
      rows: cross("revenue", "cost"),
      columns: concat("department", "channel"),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "none" },
        measures: [{ field: "revenue", aggregation: "sum" }, { field: "cost", aggregation: "sum" }],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "concat", children: [{ type: "simple", field: "department" }, { type: "simple", field: "channel" }] },
        measures: [],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "department", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "department"),`
        + `\n     __d__1 AS (SELECT "channel", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "channel"),`
        + `\n     __d__2 AS (`
        + `\n       SELECT '0:department' AS "__src__0", __d__0."department" AS "__c__0", __ord__0 AS "__cord__0_0" FROM __d__0`
        + `\n       UNION ALL`
        + `\n       SELECT '1:channel' AS "__src__0", __d__1."channel" AS "__c__0", __ord__1 AS "__cord__0_0" FROM __d__1`
        + `\n     )`
        + `\nSELECT __d__2."__c__0", SUM(T."revenue") AS "revenue", SUM(T."cost") AS "cost"`
        + `\nFROM __d__2`
        + `\nLEFT JOIN "data" T ON (`
        + `\n    (__d__2."__src__0" = '0:department' AND T."department" = __d__2."__c__0")`
        + `\n    OR (__d__2."__src__0" = '1:channel' AND T."channel" = __d__2."__c__0")`
        + `\n    OR __d__2."__src__0" IS NULL`
        + `\n  )`
        + ` GROUP BY __d__2."__c__0", __d__2."__src__0"`
        + ` ORDER BY __d__2."__src__0", MIN(__d__2."__cord__0_0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["revenue", "cost"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel", "Online", "Retail", "Wholesale"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [13800, 9060],
        [3400, 1685],
        [10380, 6715],
        [5580, 3305],
        [1240, 725],
      ]);
    });
  });

  describe("rows=region, columns=cross(revenue) [Cross single child]", () => {
    const config: PivotConfig = {
      rows: "region",
      columns: cross("revenue"),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "simple", field: "region" },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "none" },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region")`
        + `\nSELECT __d__0."region", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__0`
        + `\nLEFT JOIN "data" T ON T."region" = __d__0."region"`
        + ` GROUP BY __d__0."region"`
        + ` ORDER BY MIN(__d__0."__ord__0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [9820, 7380],
      ]);
    });
  });

  describe("rows=hierarchy(region), columns=revenue [Hierarchy single field]", () => {
    const config: PivotConfig = {
      rows: hierarchy("region"),
      columns: "revenue",
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "hierarchy", fields: ["region"] },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "none" },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region")`
        + `\nSELECT __d__0."region", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__0`
        + `\nLEFT JOIN "data" T ON T."region" = __d__0."region"`
        + ` GROUP BY __d__0."region"`
        + ` ORDER BY MIN(__d__0."__ord__0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [9820, 7380],
      ]);
    });
  });
});

describe("Composite operators in pivot", () => {
  describe("rows=cross(hierarchy(region, country), concat(channel, segment)), columns=cross(department, concat(revenue, cost))", () => {
    const config: PivotConfig = {
      rows: cross(hierarchy("region", "country"), concat("channel", "segment")),
      columns: cross("department", concat("revenue", "cost")),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: {
          type: "cross",
          children: [
            { type: "hierarchy", fields: ["region", "country"] },
            { type: "concat", children: [{ type: "simple", field: "channel" }, { type: "simple", field: "segment" }] },
          ],
        },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "cross", children: [{ type: "simple", field: "department" }] },
        measures: [{ field: "revenue", aggregation: "sum" }, { field: "cost", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", "country", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country"),`
        + `\n     __d__1 AS (SELECT "channel", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "channel"),`
        + `\n     __d__2 AS (SELECT "segment", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "segment"),`
        + `\n     __d__3 AS (`
        + `\n       SELECT '0:channel' AS "__src__0", __d__1."channel" AS "__c__0", __ord__1 AS "__cord__0_0" FROM __d__1`
        + `\n       UNION ALL`
        + `\n       SELECT '1:segment' AS "__src__0", __d__2."segment" AS "__c__0", __ord__2 AS "__cord__0_0" FROM __d__2`
        + `\n     ),`
        + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3),`
        + `\n     __d__5 AS (SELECT "department", MIN(rowid) AS "__ord__5" FROM "data" GROUP BY "department"),`
        + `\n     __d__6 AS (SELECT * FROM __d__4 CROSS JOIN __d__5)`
        + `\nSELECT __d__6."region", __d__6."country", __d__6."__c__0", __d__6."department", SUM(T."revenue") AS "revenue", SUM(T."cost") AS "cost"`
        + `\nFROM __d__6`
        + `\nLEFT JOIN "data" T ON T."region" = __d__6."region" AND T."country" = __d__6."country" AND T."department" = __d__6."department" AND (`
        + `\n    (__d__6."__src__0" = '0:channel' AND T."channel" = __d__6."__c__0")`
        + `\n    OR (__d__6."__src__0" = '1:segment' AND T."segment" = __d__6."__c__0")`
        + `\n    OR __d__6."__src__0" IS NULL`
        + `\n  )`
        + ` GROUP BY __d__6."region", __d__6."country", __d__6."__c__0", __d__6."department", __d__6."__src__0"`
        + ` ORDER BY MIN(__d__6."__ord__0"), __d__6."__src__0", MIN(__d__6."__cord__0_0"), MIN(__d__6."__ord__5")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "North America", "North America", "North America", "North America", "North America", "North America", "North America", "North America", "Europe", "Europe", "Europe", "Europe", "Europe", "Europe", "Europe", "Europe", "Europe", "Europe"],
        ["USA", "USA", "USA", "USA", "USA", "Canada", "Canada", "Canada", "Canada", "Canada", "UK", "UK", "UK", "UK", "UK", "Germany", "Germany", "Germany", "Germany", "Germany"],
        ["Online", "Retail", "Wholesale", "Consumer", "Business", "Online", "Retail", "Wholesale", "Consumer", "Business", "Online", "Retail", "Wholesale", "Consumer", "Business", "Online", "Retail", "Wholesale", "Consumer", "Business"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Apparel", "Apparel"],
        ["revenue", "cost", "revenue", "cost"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [4750, 1700, null, 4400, 2050, 1700, null, null, 1000, 700, 1400, 850, null, 1400, 850, 1300, 1350, 750, 2650, 750],
        [3130, 1050, null, 2850, 1330, 1150, null, null, 700, 450, 950, 520, null, 950, 520, 880, 900, 480, 1780, 480],
        [550, 350, 290, 550, 640, null, 280, 200, 280, 200, 400, 700, null, 780, 320, 280, 350, null, 630, null],
        [270, 175, 145, 270, 320, null, 140, 100, 140, 100, 200, 350, null, 390, 160, 135, 170, null, 305, null],
      ]);
    });
  });

  describe("rows=cross(hierarchy(region, country), channel), columns=cross(department, concat(revenue, cost, units_sold)) [Deep nesting]", () => {
    const config: PivotConfig = {
      rows: cross(hierarchy("region", "country"), "channel"),
      columns: cross("department", concat("revenue", "cost", "units_sold")),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: {
          type: "cross",
          children: [
            { type: "hierarchy", fields: ["region", "country"] },
            { type: "simple", field: "channel" },
          ],
        },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "cross", children: [{ type: "simple", field: "department" }] },
        measures: [
          { field: "revenue", aggregation: "sum" },
          { field: "cost", aggregation: "sum" },
          { field: "units_sold", aggregation: "sum" },
        ],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", "country", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country"),`
        + `\n     __d__1 AS (SELECT "channel", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "channel"),`
        + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1),`
        + `\n     __d__3 AS (SELECT "department", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "department"),`
        + `\n     __d__4 AS (SELECT * FROM __d__2 CROSS JOIN __d__3)`
        + `\nSELECT __d__4."region", __d__4."country", __d__4."channel", __d__4."department", SUM(T."revenue") AS "revenue", SUM(T."cost") AS "cost", SUM(T."units_sold") AS "units_sold"`
        + `\nFROM __d__4`
        + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND T."country" = __d__4."country" AND T."channel" = __d__4."channel" AND T."department" = __d__4."department"`
        + ` GROUP BY __d__4."region", __d__4."country", __d__4."channel", __d__4."department"`
        + ` ORDER BY MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__3")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "North America", "North America", "North America", "North America", "Europe", "Europe", "Europe", "Europe", "Europe", "Europe"],
        ["USA", "USA", "USA", "Canada", "Canada", "Canada", "UK", "UK", "UK", "Germany", "Germany", "Germany"],
        ["Online", "Retail", "Wholesale", "Online", "Retail", "Wholesale", "Online", "Retail", "Wholesale", "Online", "Retail", "Wholesale"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Electronics", "Apparel", "Apparel", "Apparel"],
        ["revenue", "cost", "units_sold", "revenue", "cost", "units_sold"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [4750, 1700, null, 1700, null, null, 1400, 850, null, 1300, 1350, 750],
        [3130, 1050, null, 1150, null, null, 950, 520, null, 880, 900, 480],
        [55, 42, null, 24, null, null, 11, 19, null, 10, 11, 17],
        [550, 350, 290, null, 280, 200, 400, 700, null, 280, 350, null],
        [270, 175, 145, null, 140, 100, 200, 350, null, 135, 170, null],
        [40, 18, 13, null, 14, 30, 20, 45, null, 22, 16, null],
      ]);
    });
  });

  describe("rows=concat(hierarchy(region, country), department), columns=revenue [Concat hierarchy + string on rows]", () => {
    const config: PivotConfig = {
      rows: concat(hierarchy("region", "country"), "department"),
      columns: "revenue",
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: {
          type: "concat",
          children: [
            { type: "hierarchy", fields: ["region", "country"] },
            { type: "simple", field: "department" },
          ],
        },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "none" },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", "country", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country"),`
        + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
        + `\n     __d__2 AS (`
        + `\n       SELECT '0:region,country' AS "__src__0", __d__0."region" AS "__c__0", __d__0."country" AS "__c__1", __ord__0 AS "__cord__0_0" FROM __d__0`
        + `\n       UNION ALL`
        + `\n       SELECT '1:department' AS "__src__0", __d__1."department" AS "__c__0", CAST(NULL AS VARCHAR) AS "__c__1", __ord__1 AS "__cord__0_0" FROM __d__1`
        + `\n     )`
        + `\nSELECT __d__2."__c__0", __d__2."__c__1", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__2`
        + `\nLEFT JOIN "data" T ON (`
        + `\n    (__d__2."__src__0" = '0:region,country' AND T."region" = __d__2."__c__0" AND T."country" = __d__2."__c__1")`
        + `\n    OR (__d__2."__src__0" = '1:department' AND T."department" = __d__2."__c__0")`
        + `\n    OR __d__2."__src__0" IS NULL`
        + `\n  )`
        + ` GROUP BY __d__2."__c__0", __d__2."__c__1", __d__2."__src__0"`
        + ` ORDER BY __d__2."__src__0", MIN(__d__2."__cord__0_0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe", "Electronics", "Apparel"],
        ["USA", "Canada", "UK", "Germany", null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [7640, 2180, 3350, 4030, 13800, 3400],
      ]);
    });
  });

  describe("rows=concat(hierarchy(region, country), hierarchy(department, product)), columns=revenue [Concat two hierarchies on rows]", () => {
    const config: PivotConfig = {
      rows: concat(hierarchy("region", "country"), hierarchy("department", "product")),
      columns: "revenue",
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: {
          type: "concat",
          children: [
            { type: "hierarchy", fields: ["region", "country"] },
            { type: "hierarchy", fields: ["department", "product"] },
          ],
        },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "none" },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", "country", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country"),`
        + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
        + `\n     __d__2 AS (`
        + `\n       SELECT '0:region,country' AS "__src__0", __d__0."region" AS "__c__0", __d__0."country" AS "__c__1", __ord__0 AS "__cord__0_0" FROM __d__0`
        + `\n       UNION ALL`
        + `\n       SELECT '1:department,product' AS "__src__0", __d__1."department" AS "__c__0", __d__1."product" AS "__c__1", __ord__1 AS "__cord__0_0" FROM __d__1`
        + `\n     )`
        + `\nSELECT __d__2."__c__0", __d__2."__c__1", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__2`
        + `\nLEFT JOIN "data" T ON (`
        + `\n    (__d__2."__src__0" = '0:region,country' AND T."region" = __d__2."__c__0" AND T."country" = __d__2."__c__1")`
        + `\n    OR (__d__2."__src__0" = '1:department,product' AND T."department" = __d__2."__c__0" AND T."product" = __d__2."__c__1")`
        + `\n    OR __d__2."__src__0" IS NULL`
        + `\n  )`
        + ` GROUP BY __d__2."__c__0", __d__2."__c__1", __d__2."__src__0"`
        + ` ORDER BY __d__2."__src__0", MIN(__d__2."__cord__0_0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe", "Electronics", "Electronics", "Apparel", "Apparel"],
        ["USA", "Canada", "UK", "Germany", "Laptop", "Phone", "Jacket", "Shoes"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [7640, 2180, 3350, 4030, 8850, 4950, 2350, 1050],
      ]);
    });
  });

  describe("rows=concat(hierarchy(region, country), hierarchy(department, product, channel)), columns=revenue [Concat two hierarchies uneven on rows]", () => {
    const config: PivotConfig = {
      rows: concat(hierarchy("region", "country"), hierarchy("department", "product", "channel")),
      columns: "revenue",
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: {
          type: "concat",
          children: [
            { type: "hierarchy", fields: ["region", "country"] },
            { type: "hierarchy", fields: ["department", "product", "channel"] },
          ],
        },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: { type: "none" },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", "country", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country"),`
        + `\n     __d__1 AS (SELECT "department", "product", "channel", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product", "channel"),`
        + `\n     __d__2 AS (`
        + `\n       SELECT '0:region,country' AS "__src__0", __d__0."region" AS "__c__0", __d__0."country" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __ord__0 AS "__cord__0_0" FROM __d__0`
        + `\n       UNION ALL`
        + `\n       SELECT '1:department,product,channel' AS "__src__0", __d__1."department" AS "__c__0", __d__1."product" AS "__c__1", __d__1."channel" AS "__c__2", __ord__1 AS "__cord__0_0" FROM __d__1`
        + `\n     )`
        + `\nSELECT __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__2`
        + `\nLEFT JOIN "data" T ON (`
        + `\n    (__d__2."__src__0" = '0:region,country' AND T."region" = __d__2."__c__0" AND T."country" = __d__2."__c__1")`
        + `\n    OR (__d__2."__src__0" = '1:department,product,channel' AND T."department" = __d__2."__c__0" AND T."product" = __d__2."__c__1" AND T."channel" = __d__2."__c__2")`
        + `\n    OR __d__2."__src__0" IS NULL`
        + `\n  )`
        + ` GROUP BY __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", __d__2."__src__0"`
        + ` ORDER BY __d__2."__src__0", MIN(__d__2."__cord__0_0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe", "Electronics", "Electronics", "Apparel", "Apparel", "Apparel", "Electronics", "Apparel", "Apparel", "Electronics", "Apparel", "Electronics"],
        ["USA", "Canada", "UK", "Germany", "Laptop", "Phone", "Jacket", "Jacket", "Shoes", "Phone", "Shoes", "Shoes", "Phone", "Jacket", "Laptop"],
        [null, null, null, null, "Online", "Retail", "Online", "Retail", "Online", "Online", "Wholesale", "Retail", "Wholesale", "Wholesale", "Retail"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [7640, 2180, 3350, 4030, 7500, 2550, 700, 1360, 530, 1650, 200, 320, 750, 290, 1350],
      ]);
    });
  });

  describe("rows=region, columns=cross(concat(hierarchy(department, product), channel), revenue) [Concat hierarchy + string inside cross on columns]", () => {
    const config: PivotConfig = {
      rows: "region",
      columns: cross(concat(hierarchy("department", "product"), "channel"), "revenue"),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "simple", field: "region" },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: {
          type: "cross",
          children: [{
            type: "concat",
            children: [
              { type: "hierarchy", fields: ["department", "product"] },
              { type: "simple", field: "channel" },
            ],
          }],
        },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
        + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
        + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
        + `\n     __d__3 AS (`
        + `\n       SELECT '0:department,product' AS "__src__0", __d__1."department" AS "__c__0", __d__1."product" AS "__c__1", __ord__1 AS "__cord__0_0" FROM __d__1`
        + `\n       UNION ALL`
        + `\n       SELECT '1:channel' AS "__src__0", __d__2."channel" AS "__c__0", CAST(NULL AS VARCHAR) AS "__c__1", __ord__2 AS "__cord__0_0" FROM __d__2`
        + `\n     ),`
        + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
        + `\nSELECT __d__4."region", __d__4."__c__0", __d__4."__c__1", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__4`
        + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (`
        + `\n    (__d__4."__src__0" = '0:department,product' AND T."department" = __d__4."__c__0" AND T."product" = __d__4."__c__1")`
        + `\n    OR (__d__4."__src__0" = '1:channel' AND T."channel" = __d__4."__c__0")`
        + `\n    OR __d__4."__src__0" IS NULL`
        + `\n  )`
        + ` GROUP BY __d__4."region", __d__4."__c__0", __d__4."__c__1", __d__4."__src__0"`
        + ` ORDER BY MIN(__d__4."__ord__0"), __d__4."__src__0", MIN(__d__4."__cord__0_0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Apparel", "Apparel", "Online", "Retail", "Wholesale"],
        ["Laptop", "Phone", "Jacket", "Shoes", null, null, null],
        ["revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [4800, 4050],
        [3350, 1600],
        [1220, 1130],
        [450, 600],
        [7000, 3380],
        [2330, 3250],
        [490, 750],
      ]);
    });
  });

  describe("rows=quarter, columns=cross(cross(region, concat(department, channel)), revenue)", () => {
    const config: PivotConfig = {
      rows: "quarter",
      columns: cross(cross("region", concat("department", "channel")), "revenue"),
    };

    it("config -> IR", async () => {
      const model = await makeModel();
      const rowIR = model.buildAxisIR(config.rows as AxisExpr);
      const colIR = model.buildAxisIR(config.columns as AxisExpr);

      expect(rowIR).to.deep.equal({
        dimSpec: { type: "simple", field: "quarter" },
        measures: [],
      });
      expect(colIR).to.deep.equal({
        dimSpec: {
          type: "cross",
          children: [
            {
              type: "cross",
              children: [
                { type: "simple", field: "region" },
                { type: "concat", children: [{ type: "simple", field: "department" }, { type: "simple", field: "channel" }] },
              ],
            },
          ],
        },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "quarter", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "quarter"),`
        + `\n     __d__1 AS (SELECT "region", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "region"),`
        + `\n     __d__2 AS (SELECT "department", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "department"),`
        + `\n     __d__3 AS (SELECT "channel", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "channel"),`
        + `\n     __d__4 AS (`
        + `\n       SELECT '0:department' AS "__src__0", __d__2."department" AS "__c__0", __ord__2 AS "__cord__0_0" FROM __d__2`
        + `\n       UNION ALL`
        + `\n       SELECT '1:channel' AS "__src__0", __d__3."channel" AS "__c__0", __ord__3 AS "__cord__0_0" FROM __d__3`
        + `\n     ),`
        + `\n     __d__5 AS (SELECT * FROM __d__1 CROSS JOIN __d__4),`
        + `\n     __d__6 AS (SELECT * FROM __d__0 CROSS JOIN __d__5)`
        + `\nSELECT __d__6."quarter", __d__6."region", __d__6."__c__0", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__6`
        + `\nLEFT JOIN "data" T ON T."quarter" = __d__6."quarter" AND T."region" = __d__6."region" AND (`
        + `\n    (__d__6."__src__0" = '0:department' AND T."department" = __d__6."__c__0")`
        + `\n    OR (__d__6."__src__0" = '1:channel' AND T."channel" = __d__6."__c__0")`
        + `\n    OR __d__6."__src__0" IS NULL`
        + `\n  )`
        + ` GROUP BY __d__6."quarter", __d__6."region", __d__6."__c__0", __d__6."__src__0"`
        + ` ORDER BY MIN(__d__6."__ord__0"), MIN(__d__6."__ord__1"), __d__6."__src__0", MIN(__d__6."__cord__0_0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([["Q1", "Q2", "Q3"]]);
      expect(vm.columnFacets).to.deep.equal([
        ["North America", "North America", "North America", "North America", "North America", "Europe", "Europe", "Europe", "Europe", "Europe"],
        ["Electronics", "Apparel", "Online", "Retail", "Wholesale", "Electronics", "Apparel", "Online", "Retail", "Wholesale"],
        ["revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [4100, 3100, 950],
        [830, 550, 290],
        [3850, 2200, 950],
        [1080, 1250, null],
        [null, 200, 290],
        [3550, 750, 1350],
        [350, 1000, 380],
        [2700, 680, null],
        [1200, 320, 1730],
        [null, 750, null],
      ]);
    });
  });
});

describe("Sorting", () => {
  describe("rows=region, columns=cross(department, revenue), sort region asc", () => {
    const config: PivotConfig = {
      rows: "region",
      columns: cross("department", "revenue"),
      sort: [{ field: "region", direction: "asc" }],
    };

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      // Alphabetical asc: Europe < North America
      expect(vm.rowFacets).to.deep.equal([
        ["Europe", "North America"],
      ]);
      // Column order must remain unchanged (Electronics, Apparel)
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
        ["revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [5650, 8150],
        [1730, 1670],
      ]);
    });
  });

  describe("rows=region, columns=cross(department, revenue), sort region desc", () => {
    const config: PivotConfig = {
      rows: "region",
      columns: cross("department", "revenue"),
      sort: [{ field: "region", direction: "desc" }],
    };

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      // Alphabetical desc: North America > Europe
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
        ["revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [8150, 5650],
        [1670, 1730],
      ]);
    });
  });

  describe("rows=region, columns=cross(department, revenue), sort region by revenue desc", () => {
    const config: PivotConfig = {
      rows: "region",
      columns: cross("department", "revenue"),
      sort: [{ field: "region", direction: "desc", by: "revenue" }],
    };

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      // NA total revenue=9820, EU=7380 → desc: NA first
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
        ["revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [8150, 5650],
        [1670, 1730],
      ]);
    });
  });

  describe("rows=region, columns=cross(department, revenue), sort region by revenue asc", () => {
    const config: PivotConfig = {
      rows: "region",
      columns: cross("department", "revenue"),
      sort: [{ field: "region", direction: "asc", by: "revenue" }],
    };

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      // NA total revenue=9820, EU=7380 → asc: EU first
      expect(vm.rowFacets).to.deep.equal([
        ["Europe", "North America"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
        ["revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [5650, 8150],
        [1730, 1670],
      ]);
    });
  });

  describe("rows=hierarchy(region, country), columns=cross(department, revenue), sort country by revenue desc (region noop)", () => {
    const config: PivotConfig = {
      rows: hierarchy("region", "country"),
      columns: cross("department", "revenue"),
      sort: [{ field: "country", direction: "desc", by: "revenue" }],
    };

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      // region noop → NA first (natural order), EU second
      // Within NA: USA=7640, Canada=2180 → desc: USA, Canada
      // Within EU: Germany=4030, UK=3350 → desc: Germany, UK
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe"],
        ["USA", "Canada", "Germany", "UK"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
        ["revenue", "revenue"],
      ]);
      // NA/USA: Elec=4750+1700+950=sum of USA electronics rows → let me recalculate
      // USA Electronics: rows 0,1,2,5,6,20 = 1200+1500+800+1100+900+950=6450
      // USA Apparel: rows 3,4,7,22 = 300+350+250+290=1190
      // Canada Electronics: rows 8,9 = 1000+700=1700
      // Canada Apparel: rows 10,11 = 280+200=480
      // Germany Electronics: rows 16,17,23 = 1300+750+1350=3400
      // Germany Apparel: rows 18,19 = 350+280=630
      // UK Electronics: rows 12,13 = 1400+850=2250
      // UK Apparel: rows 14,15,21 = 400+320+380=1100
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [6450, 1700, 3400, 2250],
        [1190, 480, 630, 1100],
      ]);
    });
  });

  describe("rows=hierarchy(region, country), columns=cross(department, revenue), sort region asc + country by revenue desc", () => {
    const config: PivotConfig = {
      rows: hierarchy("region", "country"),
      columns: cross("department", "revenue"),
      sort: [
        { field: "region", direction: "asc" },
        { field: "country", direction: "desc", by: "revenue" },
      ],
    };

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      // region asc: Europe, North America
      // Within EU: Germany=4030 > UK=3350 → Germany, UK
      // Within NA: USA=7640 > Canada=2180 → USA, Canada
      expect(vm.rowFacets).to.deep.equal([
        ["Europe", "Europe", "North America", "North America"],
        ["Germany", "UK", "USA", "Canada"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
        ["revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [3400, 2250, 6450, 1700],
        [630, 1100, 1190, 480],
      ]);
    });
  });

  describe("rows=cross(region, department), columns=cross(channel, revenue), sort region asc + department desc", () => {
    const config: PivotConfig = {
      rows: cross("region", "department"),
      columns: cross("channel", "revenue"),
      sort: [
        { field: "region", direction: "asc" },
        { field: "department", direction: "desc" },
      ],
    };

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      // region asc: Europe, North America
      // department desc: Electronics > Apparel
      // So: EU/Elec, EU/App, NA/Elec, NA/App
      expect(vm.rowFacets).to.deep.equal([
        ["Europe", "Europe", "North America", "North America"],
        ["Electronics", "Apparel", "Electronics", "Apparel"],
      ]);
      // Column order must remain unchanged (Online, Retail, Wholesale)
      expect(vm.columnFacets).to.deep.equal([
        ["Online", "Retail", "Wholesale"],
        ["revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [2700, 680, 6450, 550],
        [2200, 1050, 1700, 630],
        [750, null, null, 490],
      ]);
    });
  });
});
