/* eslint-disable quotes */
import { expect } from "chai";
import { concat, cross, hierarchy } from "./grid-pivot-datamodel";
import { makeModel, makePatchedModel } from "./datamodel.data.test";
import { DuckDBDataSource } from "./duckdb-datasource";
import { SqlPivotDataModel } from "./sql-pivot-datamodel";
import { SqlColumnType } from "./datasource";
import { AxisConfig, PivotConfig, ProjectionState, Schema } from "./types";
import { GridDataViewModel } from "../renderer/grid-data-viewmodel";

const facetMeta = (vm: GridDataViewModel) => ({
  row: vm.facetDefs.row.map(d => d.meta).filter(m => m !== undefined),
  col: vm.facetDefs.col.map(d => d.meta).filter(m => m !== undefined),
});

describe("Dimensional Projections", () => {
  describe("hierarchy base state — rows collapsed to region only", () => {
    const rowExpr = hierarchy("region", "country", "city");
    const colExpr = cross(concat("department", "channel"), "revenue");
    const rowConfig: AxisConfig = { expr: rowExpr, projection: [] };
    const colConfig: AxisConfig = { expr: colExpr, projection: [] };
    const config: PivotConfig = { rows: rowConfig, columns: colConfig };

    it("config -> projected IR", async () => {
      const model = await makeModel();
      const { merged } = model.getIR(config);

      expect(merged).to.deep.equal({
        dimSpec: {
          type: "cross",
          children: [
            {
              type: "hierarchy",
              fields: ["region", "country", "city"],
              filter: [],
              segments: [{ groupBy: ["region"] }],
            },
            {
              type: "cross",
              children: [{
                type: "concat",
                children: [
                  { type: "simple", field: "department", filter: [] },
                  { type: "simple", field: "channel", filter: [] },
                ],
              }],
              filter: [],
            },
          ],
          filter: [],
        },
        measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
        + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
        + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
        + `\n     __d__3 AS (`
        + `\n       SELECT '0:department' AS "__src__0", __d__1."department" AS "__c__0", __ord__1 AS "__cord__0_0" FROM __d__1`
        + `\n       UNION ALL`
        + `\n       SELECT '1:channel' AS "__src__0", __d__2."channel" AS "__c__0", __ord__2 AS "__cord__0_0" FROM __d__2`
        + `\n     ),`
        + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
        + `\nSELECT __d__4."region", __d__4."country", __d__4."city", __d__4."__c__0", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__4`
        + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (T."country" = __d__4."country" OR __d__4."country" IS NULL) AND (T."city" = __d__4."city" OR __d__4."city" IS NULL) AND (`
        + `\n    (__d__4."__src__0" = '0:department' AND T."department" = __d__4."__c__0")`
        + `\n    OR (__d__4."__src__0" = '1:channel' AND T."channel" = __d__4."__c__0")`
        + `\n    OR __d__4."__src__0" IS NULL`
        + `\n  )`
        + ` GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."__c__0", __d__4."__src__0"`
        + ` ORDER BY MIN(__d__4."__ord__0"), __d__4."__src__0", MIN(__d__4."__cord__0_0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel (projection on rows)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel({ rows: rowConfig, columns: colExpr });

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
        [null, null],
        [null, null],
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

    it("config -> IR -> SQL -> data-viewmodel (projection on both axes)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
        [null, null],
        [null, null],
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
      const NP = ProjectionState.NOT_PROJECTED;
      expect(facetMeta(vm)).to.deep.equal({
        row: [
          { projectionState: NP, projectedValues: new Set() },
          { projectionState: NP, projectedValues: new Set() },
          { projectionState: NP, projectedValues: new Set() },
        ],
        col: [
          { projectionState: NP, projectedValues: new Set() },
        ],
      });
    });
  });

  describe("hierarchy selective expand — wildcard to country, USA to city", () => {
    const rowExpr = hierarchy("region", "country", "city");
    const colExpr = cross(concat("department", "channel"), "revenue");
    const config: PivotConfig = {
      rows: { expr: rowExpr, projection: [{ open: "*", next: { open: ["USA"] } }] },
      columns: colExpr,
    };

    it("config -> projected IR", async () => {
      const model = await makeModel();
      const { merged } = model.getIR(config);

      expect(merged).to.deep.equal({
        dimSpec: {
          type: "cross",
          children: [
            {
              type: "hierarchy",
              fields: ["region", "country", "city"],
              filter: [],
              segments: [
                { groupBy: ["region", "country", "city"], filter: { pass: [{ field: "country", values: ["USA"] }], fail: [] } },
                { groupBy: ["region", "country"], filter: { pass: [], fail: [{ field: "country", values: ["USA"] }] } },
              ],
            },
            {
              type: "cross",
              children: [{
                type: "concat",
                children: [
                  { type: "simple", field: "department", filter: [] },
                  { type: "simple", field: "channel", filter: [] },
                ],
              }],
              filter: [],
            },
          ],
          filter: [],
        },
        measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (`
        + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "country" IN ('USA') GROUP BY "region", "country", "city"`
        + `\n       UNION ALL`
        + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("country" IN ('USA'), FALSE)) GROUP BY "region", "country"`
        + `\n     ),`
        + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
        + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
        + `\n     __d__3 AS (`
        + `\n       SELECT '0:department' AS "__src__0", __d__1."department" AS "__c__0", __ord__1 AS "__cord__0_0" FROM __d__1`
        + `\n       UNION ALL`
        + `\n       SELECT '1:channel' AS "__src__0", __d__2."channel" AS "__c__0", __ord__2 AS "__cord__0_0" FROM __d__2`
        + `\n     ),`
        + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
        + `\nSELECT __d__4."region", __d__4."country", __d__4."city", __d__4."__c__0", SUM(T."revenue") AS "revenue"`
        + `\nFROM __d__4`
        + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND T."country" = __d__4."country" AND (T."city" = __d__4."city" OR __d__4."city" IS NULL) AND (`
        + `\n    (__d__4."__src__0" = '0:department' AND T."department" = __d__4."__c__0")`
        + `\n    OR (__d__4."__src__0" = '1:channel' AND T."channel" = __d__4."__c__0")`
        + `\n    OR __d__4."__src__0" IS NULL`
        + `\n  ) GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."__c__0", __d__4."__src__0" ORDER BY MIN(__d__4."__sord__0"), MIN(__d__4."__ord__0"), __d__4."__src__0", MIN(__d__4."__cord__0_0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "North America", "Europe", "Europe"],
        ["USA", "USA", "Canada", "UK", "Germany"],
        ["New York", "Chicago", null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel", "Online", "Retail", "Wholesale"],
        ["revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [4450, 2000, 1700, 2250, 3400],
        [650, 540, 480, 1100, 630],
        [3950, 1350, 1700, 1800, 1580],
        [1150, 900, 280, 1550, 1700],
        [null, 290, 200, null, 750],
      ]);
      expect(facetMeta(vm)).to.deep.equal({
        row: [
          { projectionState: ProjectionState.PROJECTED, projectedValues: new Set() },
          { projectionState: ProjectionState.SOME_PROJECTED, projectedValues: new Set(["USA"]) },
          { projectionState: ProjectionState.NOT_PROJECTED, projectedValues: new Set() },
        ],
        col: [
          { projectionState: ProjectionState.PROJECTION_NOT_CONFIGURED, projectedValues: new Set() },
        ],
      });
    });
  });

  describe("both axes hierarchy — row and column projections independent", () => {
    const rowExpr = hierarchy("region", "country", "city");
    const colExpr = cross(hierarchy("department", "product"), "channel", "revenue");

    describe("row expand NA to country, columns unprojected", () => {
      const config: PivotConfig = {
        rows: { expr: rowExpr, projection: [{ open: ["North America"] }] },
        columns: colExpr,
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(merged).to.deep.equal({
          dimSpec: {
            type: "cross",
            children: [
              {
                type: "hierarchy",
                fields: ["region", "country", "city"],
                filter: [],
                segments: [
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["North America"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["North America"] }] } },
                ],
              },
              {
                type: "cross",
                children: [
                  { type: "hierarchy", fields: ["department", "product"], filter: [] },
                  { type: "simple", field: "channel", filter: [] },
                ],
                filter: [],
              },
            ],
            filter: [],
          },
          measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('North America'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
          + `\n     __d__3 AS (SELECT * FROM __d__1 CROSS JOIN __d__2),`
          + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
          + `\nSELECT __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (T."country" = __d__4."country" OR __d__4."country" IS NULL) AND (T."city" = __d__4."city" OR __d__4."city" IS NULL) AND T."department" = __d__4."department" AND T."product" = __d__4."product" AND T."channel" = __d__4."channel" GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel" ORDER BY MIN(__d__4."__sord__0"), MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__2")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "Europe"],
          ["USA", "Canada", null],
          [null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([
          ["Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Apparel", "Apparel", "Apparel", "Apparel", "Apparel", "Apparel"],
          ["Laptop", "Laptop", "Laptop", "Phone", "Phone", "Phone", "Jacket", "Jacket", "Jacket", "Shoes", "Shoes", "Shoes"],
          ["Online", "Retail", "Wholesale", "Online", "Retail", "Wholesale", "Online", "Retail", "Wholesale", "Online", "Retail", "Wholesale"],
          ["revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue"],
        ]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [3800, 1000, 2700],  // Elec/Laptop/Online
          [null, null, 1350],  // Elec/Laptop/Retail
          [null, null, null],  // Elec/Laptop/Wholesale
          [950, 700, null],    // Elec/Phone/Online
          [1700, null, 850],   // Elec/Phone/Retail
          [null, null, 750],   // Elec/Phone/Wholesale
          [300, null, 400],    // App/Jacket/Online
          [350, 280, 730],     // App/Jacket/Retail
          [290, null, null],   // App/Jacket/Wholesale
          [250, null, 280],    // App/Shoes/Online
          [null, null, 320],   // App/Shoes/Retail
          [null, 200, null],   // App/Shoes/Wholesale
        ]);
      });
    });

    describe("row expand NA+EU to country, col expand Electronics to product", () => {
      const config: PivotConfig = {
        rows: { expr: rowExpr, projection: [{ open: ["North America"] }, { open: ["Europe"] }] },
        columns: { expr: colExpr, projection: [{ open: ["Electronics"], next: { open: "*" } }] },
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(merged).to.deep.equal({
          dimSpec: {
            type: "cross",
            children: [
              {
                type: "hierarchy",
                fields: ["region", "country", "city"],
                filter: [],
                segments: [
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["North America"] }], fail: [] } },
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["North America", "Europe"] }] } },
                ],
              },
              {
                type: "cross",
                children: [
                  {
                    type: "hierarchy",
                    fields: ["department", "product"],
                    filter: [],
                    segments: [
                      { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Electronics"] }], fail: [] } },
                      { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Electronics"] }] } },
                    ],
                  },
                  { type: "simple", field: "channel", filter: [] },
                ],
                filter: [],
                segments: [
                  { visibleChildren: 2, filter: { pass: [{ field: "department", values: ["Electronics"] }], fail: [] } },
                  { visibleChildren: 1, filter: { pass: [], fail: [{ field: "department", values: ["Electronics"] }] } },
                ],
              },
            ],
            filter: [],
          },
          measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('North America','Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Electronics') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Electronics'), FALSE)) GROUP BY "department"`
          + `\n     ),`
          + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
          + `\n     __d__3 AS (`
          + `\n       SELECT __d__1."department", __d__1."product", __d__2."channel", __d__1."__sord__1", __d__1."__ord__1", __d__2."__ord__2" FROM __d__1 CROSS JOIN __d__2 WHERE __d__1."department" IN ('Electronics')`
          + `\n       UNION ALL`
          + `\n       SELECT __d__1."department", __d__1."product", CAST(NULL AS VARCHAR) AS "channel", __d__1."__sord__1", __d__1."__ord__1", 0 AS "__ord__2" FROM __d__1 WHERE NOT (COALESCE(__d__1."department" IN ('Electronics'), FALSE))`
          + `\n     ),`
          + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
          + `\nSELECT __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (T."country" = __d__4."country" OR __d__4."country" IS NULL) AND (T."city" = __d__4."city" OR __d__4."city" IS NULL) AND T."department" = __d__4."department" AND (T."product" = __d__4."product" OR __d__4."product" IS NULL) AND (T."channel" = __d__4."channel" OR __d__4."channel" IS NULL) GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel" ORDER BY MIN(__d__4."__sord__0"), MIN(__d__4."__ord__0"), MIN(__d__4."__sord__1"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__2")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "Europe", "Europe"],
          ["USA", "Canada", "UK", "Germany"],
          [null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([
          ["Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Apparel"],
          ["Laptop", "Laptop", "Laptop", "Phone", "Phone", "Phone", null],
          ["Online", "Retail", "Wholesale", "Online", "Retail", "Wholesale", null],
          ["revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue"],
        ]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [3800, 1000, 1400, 1300],  // Elec/Laptop/Online
          [null, null, null, 1350],  // Elec/Laptop/Retail
          [null, null, null, null],  // Elec/Laptop/Wholesale
          [950, 700, null, null],    // Elec/Phone/Online
          [1700, null, 850, null],   // Elec/Phone/Retail
          [null, null, null, 750],   // Elec/Phone/Wholesale
          [1190, 480, 1100, 630],   // Apparel
        ]);
      });
    });

    describe("row expand NA+EU to country, col wildcard expand all departments to product", () => {
      const config: PivotConfig = {
        rows: { expr: rowExpr, projection: [{ open: ["North America"] }, { open: ["Europe"] }] },
        columns: { expr: colExpr, projection: [{ open: ["Electronics"], next: { open: "*" } }, { open: "*" }] },
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(merged).to.deep.equal({
          dimSpec: {
            type: "cross",
            children: [
              {
                type: "hierarchy",
                fields: ["region", "country", "city"],
                filter: [],
                segments: [
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["North America"] }], fail: [] } },
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["North America", "Europe"] }] } },
                ],
              },
              {
                type: "cross",
                children: [
                  { type: "hierarchy", fields: ["department", "product"], filter: [] },
                  { type: "simple", field: "channel", filter: [] },
                ],
                filter: [],
              },
            ],
            filter: [],
          },
          measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('North America','Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
          + `\n     __d__3 AS (SELECT * FROM __d__1 CROSS JOIN __d__2),`
          + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
          + `\nSELECT __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (T."country" = __d__4."country" OR __d__4."country" IS NULL) AND (T."city" = __d__4."city" OR __d__4."city" IS NULL) AND T."department" = __d__4."department" AND T."product" = __d__4."product" AND T."channel" = __d__4."channel" GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel" ORDER BY MIN(__d__4."__sord__0"), MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__2")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "Europe", "Europe"],
          ["USA", "Canada", "UK", "Germany"],
          [null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([
          ["Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Apparel", "Apparel", "Apparel", "Apparel", "Apparel", "Apparel"],
          ["Laptop", "Laptop", "Laptop", "Phone", "Phone", "Phone", "Jacket", "Jacket", "Jacket", "Shoes", "Shoes", "Shoes"],
          ["Online", "Retail", "Wholesale", "Online", "Retail", "Wholesale", "Online", "Retail", "Wholesale", "Online", "Retail", "Wholesale"],
          ["revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue"],
        ]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [3800, 1000, 1400, 1300],  // Elec/Laptop/Online
          [null, null, null, 1350],  // Elec/Laptop/Retail
          [null, null, null, null],  // Elec/Laptop/Wholesale
          [950, 700, null, null],    // Elec/Phone/Online
          [1700, null, 850, null],   // Elec/Phone/Retail
          [null, null, null, 750],   // Elec/Phone/Wholesale
          [300, null, 400, null],    // App/Jacket/Online
          [350, 280, 380, 350],     // App/Jacket/Retail
          [290, null, null, null],   // App/Jacket/Wholesale
          [250, null, null, 280],   // App/Shoes/Online
          [null, null, 320, null],  // App/Shoes/Retail
          [null, 200, null, null],  // App/Shoes/Wholesale
        ]);
        expect(facetMeta(vm)).to.deep.equal({
          row: [
            { projectionState: ProjectionState.SOME_PROJECTED, projectedValues: new Set(["North America", "Europe"]) },
            { projectionState: ProjectionState.NOT_PROJECTED, projectedValues: new Set() },
            { projectionState: ProjectionState.NOT_PROJECTED, projectedValues: new Set() },
          ],
          col: [
            { projectionState: ProjectionState.PROJECTED, projectedValues: new Set() },
            { projectionState: ProjectionState.PROJECTED, projectedValues: new Set() },
            { projectionState: ProjectionState.NOT_PROJECTED, projectedValues: new Set() },
          ],
        });
      });
    });

    describe("both axes selective deep expand", () => {
      describe("row NA->USA + EU->UK, col Electronics->Laptop + Apparel->Jacket", () => {
        const config: PivotConfig = {
          rows: { expr: rowExpr, projection: [{ open: ["North America"], next: { open: ["USA"] } }, { open: ["Europe"], next: { open: ["UK"] } }] },
          columns: { expr: colExpr, projection: [{ open: ["Electronics"], next: { open: ["Laptop"] } }, { open: ["Apparel"], next: { open: ["Jacket"] } }] },
        };

        it("config -> projected IR", async () => {
          const model = await makeModel();
          const { merged } = model.getIR(config);

          expect(merged).to.deep.equal({
            dimSpec: {
              type: "cross",
              children: [
                {
                  type: "hierarchy",
                  fields: ["region", "country", "city"],
                  filter: [],
                  segments: [
                    { groupBy: ["region", "country", "city"], filter: { pass: [{ field: "region", values: ["North America"] }, { field: "country", values: ["USA"] }], fail: [] } },
                    { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["North America"] }], fail: [{ field: "country", values: ["USA"] }] } },
                    { groupBy: ["region", "country", "city"], filter: { pass: [{ field: "region", values: ["Europe"] }, { field: "country", values: ["UK"] }], fail: [] } },
                    { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Europe"] }], fail: [{ field: "country", values: ["UK"] }] } },
                    { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["North America", "Europe"] }] } },
                  ],
                },
                {
                  type: "cross",
                  children: [
                    {
                      type: "hierarchy",
                      fields: ["department", "product"],
                      filter: [],
                      segments: [
                        { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Electronics"] }, { field: "product", values: ["Laptop"] }], fail: [] } },
                        { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Electronics"] }], fail: [{ field: "product", values: ["Laptop"] }] } },
                        { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Apparel"] }, { field: "product", values: ["Jacket"] }], fail: [] } },
                        { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Apparel"] }], fail: [{ field: "product", values: ["Jacket"] }] } },
                        { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Electronics", "Apparel"] }] } },
                      ],
                    },
                    { type: "simple", field: "channel", filter: [] },
                  ],
                  filter: [],
                  segments: [
                    { visibleChildren: 2, filter: { pass: [{ field: "department", values: ["Electronics", "Apparel"] }, { field: "product", values: ["Laptop", "Jacket"] }], fail: [] } },
                    { visibleChildren: 1, filter: { pass: [], fail: [{ field: "department", values: ["Electronics", "Apparel"] }, { field: "product", values: ["Laptop", "Jacket"] }] } },
                  ],
                },
              ],
              filter: [],
            },
            measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
          });
        });

        it("IR -> SQL", async () => {
          const model = await makePatchedModel();
          await model.getViewModel(config);

          expect(model.sqlStr()).to.equal(
            `WITH __d__0 AS (`
            + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND "country" IN ('USA') GROUP BY "region", "country", "city"`
            + `\n       UNION ALL`
            + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND NOT (COALESCE("country" IN ('USA'), FALSE)) GROUP BY "region", "country"`
            + `\n       UNION ALL`
            + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND "country" IN ('UK') GROUP BY "region", "country", "city"`
            + `\n       UNION ALL`
            + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND NOT (COALESCE("country" IN ('UK'), FALSE)) GROUP BY "region", "country"`
            + `\n       UNION ALL`
            + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('North America','Europe'), FALSE)) GROUP BY "region"`
            + `\n     ),`
            + `\n     __d__1 AS (`
            + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Electronics') AND "product" IN ('Laptop') GROUP BY "department", "product"`
            + `\n       UNION ALL`
            + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Electronics') AND NOT (COALESCE("product" IN ('Laptop'), FALSE)) GROUP BY "department", "product"`
            + `\n       UNION ALL`
            + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Apparel') AND "product" IN ('Jacket') GROUP BY "department", "product"`
            + `\n       UNION ALL`
            + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Apparel') AND NOT (COALESCE("product" IN ('Jacket'), FALSE)) GROUP BY "department", "product"`
            + `\n       UNION ALL`
            + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Electronics','Apparel'), FALSE)) GROUP BY "department"`
            + `\n     ),`
            + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
            + `\n     __d__3 AS (`
            + `\n       SELECT __d__1."department", __d__1."product", __d__2."channel", __d__1."__sord__1", __d__1."__ord__1", __d__2."__ord__2" FROM __d__1 CROSS JOIN __d__2 WHERE __d__1."department" IN ('Electronics','Apparel') AND __d__1."product" IN ('Laptop','Jacket')`
            + `\n       UNION ALL`
            + `\n       SELECT __d__1."department", __d__1."product", CAST(NULL AS VARCHAR) AS "channel", __d__1."__sord__1", __d__1."__ord__1", 0 AS "__ord__2" FROM __d__1 WHERE NOT (COALESCE(__d__1."department" IN ('Electronics','Apparel'), FALSE) AND COALESCE(__d__1."product" IN ('Laptop','Jacket'), FALSE))`
            + `\n     ),`
            + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
            + `\nSELECT __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel", SUM(T."revenue") AS "revenue"`
            + `\nFROM __d__4`
            + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (T."country" = __d__4."country" OR __d__4."country" IS NULL) AND (T."city" = __d__4."city" OR __d__4."city" IS NULL) AND T."department" = __d__4."department" AND (T."product" = __d__4."product" OR __d__4."product" IS NULL) AND (T."channel" = __d__4."channel" OR __d__4."channel" IS NULL) GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel" ORDER BY MIN(__d__4."__sord__0"), MIN(__d__4."__ord__0"), MIN(__d__4."__sord__1"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__2")`
          );
        });

        it("config -> IR -> SQL -> data-viewmodel", async () => {
          const model = await makeModel();
          const vm = await model.getViewModel(config);

          expect(vm.rowFacets).to.deep.equal([
            ["North America", "North America", "North America", "Europe", "Europe"],
            ["USA", "USA", "Canada", "UK", "Germany"],
            ["New York", "Chicago", null, "London", null],
          ]);
          expect(vm.columnFacets).to.deep.equal([
            ["Electronics", "Electronics", "Electronics", "Electronics", "Apparel", "Apparel", "Apparel", "Apparel"],
            ["Laptop", "Laptop", "Laptop", "Phone", "Jacket", "Jacket", "Jacket", "Shoes"],
            ["Online", "Retail", "Wholesale", null, "Online", "Retail", "Wholesale", null],
            ["revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue"],
          ]);
          expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
            [2700, 1100, 1000, 1400, 1300],  // Elec/Laptop/Online
            [null, null, null, null, 1350],   // Elec/Laptop/Retail
            [null, null, null, null, null],   // Elec/Laptop/Wholesale
            [1750, 900, 700, 850, 750],       // Elec/Phone
            [300, null, null, 400, null],      // App/Jacket/Online
            [350, null, 280, 380, 350],       // App/Jacket/Retail
            [null, 290, null, null, null],     // App/Jacket/Wholesale
            [null, 250, 200, 320, 280],       // App/Shoes
          ]);
        });
      });
    });
  });

  describe("hierarchy with concat measures — both axes base state", () => {
    const config: PivotConfig = {
      rows: { expr: hierarchy("region", "country"), projection: [] },
      columns: { expr: cross(hierarchy("department", "product"), concat("revenue", "cost")), projection: [] },
    };

    it("config -> projected IR", async () => {
      const model = await makeModel();
      const { merged } = model.getIR(config);

      expect(merged).to.deep.equal({
        dimSpec: {
          type: "cross",
          children: [
            {
              type: "hierarchy",
              fields: ["region", "country"],
              filter: [],
              segments: [{ groupBy: ["region"] }],
            },
            {
              type: "cross",
              children: [
                {
                  type: "hierarchy",
                  fields: ["department", "product"],
                  filter: [],
                  segments: [{ groupBy: ["department"] }],
                },
              ],
              filter: [],
            },
          ],
          filter: [],
        },
        measures: [{ field: "revenue", aggregation: "sum", filter: [] }, { field: "cost", aggregation: "sum", filter: [] }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", CAST(NULL AS VARCHAR) AS "country", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
        + `\n     __d__1 AS (SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
        + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)`
        + `\nSELECT __d__2."region", __d__2."country", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue", SUM(T."cost") AS "cost"`
        + `\nFROM __d__2`
        + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND (T."country" = __d__2."country" OR __d__2."country" IS NULL) AND T."department" = __d__2."department" AND (T."product" = __d__2."product" OR __d__2."product" IS NULL)`
        + ` GROUP BY __d__2."region", __d__2."country", __d__2."department", __d__2."product"`
        + ` ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
        [null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Apparel", "Apparel"],
        [null, null, null, null],
        ["revenue", "cost", "revenue", "cost"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [8150, 5650],
        [5330, 3730],
        [1670, 1730],
        [830, 855],
      ]);
      const NP = ProjectionState.NOT_PROJECTED;
      expect(facetMeta(vm)).to.deep.equal({
        row: [
          { projectionState: NP, projectedValues: new Set() },
          { projectionState: NP, projectedValues: new Set() },
        ],
        col: [
          { projectionState: NP, projectedValues: new Set() },
          { projectionState: NP, projectedValues: new Set() },
        ],
      });
    });
  });

  describe("hierarchy with concat measures — both axes wildcard expand", () => {
    const config: PivotConfig = {
      rows: { expr: hierarchy("region", "country"), projection: [{ open: "*" }] },
      columns: { expr: cross(hierarchy("department", "product"), concat("revenue", "cost")), projection: [{ open: "*" }] },
    };

    it("config -> projected IR", async () => {
      const model = await makeModel();
      const { merged } = model.getIR(config);

      expect(merged).to.deep.equal({
        dimSpec: {
          type: "cross",
          children: [
            {
              type: "hierarchy",
              fields: ["region", "country"],
              filter: [],
            },
            {
              type: "cross",
              children: [
                {
                  type: "hierarchy",
                  fields: ["department", "product"],
                  filter: [],
                },
              ],
              filter: [],
            },
          ],
          filter: [],
        },
        measures: [{ field: "revenue", aggregation: "sum", filter: [] }, { field: "cost", aggregation: "sum", filter: [] }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModel(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (SELECT "region", "country", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country"),`
        + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
        + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)`
        + `\nSELECT __d__2."region", __d__2."country", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue", SUM(T."cost") AS "cost"`
        + `\nFROM __d__2`
        + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND T."country" = __d__2."country" AND T."department" = __d__2."department" AND T."product" = __d__2."product"`
        + ` GROUP BY __d__2."region", __d__2."country", __d__2."department", __d__2."product"`
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
        ["Electronics", "Electronics", "Electronics", "Electronics", "Apparel", "Apparel", "Apparel", "Apparel"],
        ["Laptop", "Laptop", "Phone", "Phone", "Jacket", "Jacket", "Shoes", "Shoes"],
        ["revenue", "cost", "revenue", "cost", "revenue", "cost", "revenue", "cost"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
        [3800, 1000, 1400, 2650],
        [2550, 700, 950, 1780],
        [2650, 700, 850, 750],
        [1630, 450, 520, 480],
        [940, 280, 780, 350],
        [470, 140, 390, 170],
        [250, 200, 320, 280],
        [120, 100, 160, 135],
      ]);
      expect(facetMeta(vm)).to.deep.equal({
        row: [
          { projectionState: ProjectionState.PROJECTED, projectedValues: new Set() },
          { projectionState: ProjectionState.NOT_PROJECTED, projectedValues: new Set() },
        ],
        col: [
          { projectionState: ProjectionState.PROJECTED, projectedValues: new Set() },
          { projectionState: ProjectionState.NOT_PROJECTED, projectedValues: new Set() },
        ],
      });
    });
  });

  describe("concat two hierarchies — projection applied to each branch independently", () => {
    const concatRows = concat(hierarchy("region", "country", "city"), hierarchy("department", "product"));

    describe("base state — both branches collapsed to first level", () => {
      const config: PivotConfig = {
        rows: { expr: concatRows, projection: [] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(merged).to.deep.equal({
          dimSpec: {
            type: "concat",
            children: [
              {
                type: "hierarchy",
                fields: ["region", "country", "city"],
                filter: [],
                segments: [{ groupBy: ["region"] }],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                filter: [],
                segments: [{ groupBy: ["department"] }],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
          + `\n     __d__1 AS (SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
          + `\n     __d__2 AS (`
          + `\n       SELECT '0:region,country,city' AS "__src__0", __d__0."region" AS "__c__0", __d__0."country" AS "__c__1", __d__0."city" AS "__c__2", __ord__0 AS "__cord__0_0" FROM __d__0`
          + `\n       UNION ALL`
          + `\n       SELECT '1:department,product' AS "__src__0", __d__1."department" AS "__c__0", __d__1."product" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __ord__1 AS "__cord__0_0" FROM __d__1`
          + `\n     )`
          + `\nSELECT __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON (`
          + `\n    (__d__2."__src__0" = '0:region,country,city' AND T."region" = __d__2."__c__0" AND (T."country" = __d__2."__c__1" OR __d__2."__c__1" IS NULL) AND (T."city" = __d__2."__c__2" OR __d__2."__c__2" IS NULL))`
          + `\n    OR (__d__2."__src__0" = '1:department,product' AND T."department" = __d__2."__c__0" AND (T."product" = __d__2."__c__1" OR __d__2."__c__1" IS NULL))`
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
          ["North America", "Europe", "Electronics", "Apparel"],
          [null, null, null, null],
          [null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 7380, 13800, 3400],
        ]);
      });
    });

    describe("wildcard expand — all values to second level", () => {
      const config: PivotConfig = {
        rows: { expr: concatRows, projection: [{ open: "*" }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(merged).to.deep.equal({
          dimSpec: {
            type: "concat",
            children: [
              {
                type: "hierarchy",
                fields: ["region", "country", "city"],
                filter: [],
                segments: [{ groupBy: ["region", "country"] }],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                filter: [],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country"),`
          + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__2 AS (`
          + `\n       SELECT '0:region,country,city' AS "__src__0", __d__0."region" AS "__c__0", __d__0."country" AS "__c__1", __d__0."city" AS "__c__2", __ord__0 AS "__cord__0_0" FROM __d__0`
          + `\n       UNION ALL`
          + `\n       SELECT '1:department,product' AS "__src__0", __d__1."department" AS "__c__0", __d__1."product" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __ord__1 AS "__cord__0_0" FROM __d__1`
          + `\n     )`
          + `\nSELECT __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON (`
          + `\n    (__d__2."__src__0" = '0:region,country,city' AND T."region" = __d__2."__c__0" AND T."country" = __d__2."__c__1" AND (T."city" = __d__2."__c__2" OR __d__2."__c__2" IS NULL))`
          + `\n    OR (__d__2."__src__0" = '1:department,product' AND T."department" = __d__2."__c__0" AND T."product" = __d__2."__c__1")`
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
          ["North America", "North America", "Europe", "Europe",
            "Electronics", "Electronics", "Apparel", "Apparel"],
          ["USA", "Canada", "UK", "Germany",
            "Laptop", "Phone", "Jacket", "Shoes"],
          [null, null, null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [7640, 2180, 3350, 4030, 8850, 4950, 2350, 1050],
        ]);
      });
    });

    describe("wildcard expand two levels — fully expanded", () => {
      const config: PivotConfig = {
        rows: { expr: concatRows, projection: [{ open: "*", next: { open: "*" } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(merged).to.deep.equal({
          dimSpec: {
            type: "concat",
            children: [
              {
                type: "hierarchy",
                fields: ["region", "country", "city"],
                filter: [],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                filter: [],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", "country", "city", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country", "city"),`
          + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__2 AS (`
          + `\n       SELECT '0:region,country,city' AS "__src__0", __d__0."region" AS "__c__0", __d__0."country" AS "__c__1", __d__0."city" AS "__c__2", __ord__0 AS "__cord__0_0" FROM __d__0`
          + `\n       UNION ALL`
          + `\n       SELECT '1:department,product' AS "__src__0", __d__1."department" AS "__c__0", __d__1."product" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __ord__1 AS "__cord__0_0" FROM __d__1`
          + `\n     )`
          + `\nSELECT __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON (`
          + `\n    (__d__2."__src__0" = '0:region,country,city' AND T."region" = __d__2."__c__0" AND T."country" = __d__2."__c__1" AND T."city" = __d__2."__c__2")`
          + `\n    OR (__d__2."__src__0" = '1:department,product' AND T."department" = __d__2."__c__0" AND T."product" = __d__2."__c__1")`
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
          ["North America", "North America", "North America",
            "Europe", "Europe",
            "Electronics", "Electronics", "Apparel", "Apparel"],
          ["USA", "USA", "Canada", "UK", "Germany",
            "Laptop", "Phone", "Jacket", "Shoes"],
          ["New York", "Chicago", "Toronto", "London", "Berlin",
            null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [5100, 2540, 2180, 3350, 4030, 8850, 4950, 2350, 1050],
        ]);
      });
    });

    describe("selective expand Europe — only geo branch expands", () => {
      const config: PivotConfig = {
        rows: { expr: concatRows, projection: [{ open: ["Europe"] }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(merged).to.deep.equal({
          dimSpec: {
            type: "concat",
            children: [
              {
                type: "hierarchy",
                fields: ["region", "country", "city"],
                filter: [],
                segments: [
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["Europe"] }] } },
                ],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                filter: [],
                segments: [
                  { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Europe"] }] } },
                ],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Europe') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Europe'), FALSE)) GROUP BY "department"`
          + `\n     ),`
          + `\n     __d__2 AS (`
          + `\n       SELECT '0:region,country,city' AS "__src__0", __d__0."region" AS "__c__0", __d__0."country" AS "__c__1", __d__0."city" AS "__c__2", __sord__0 AS "__cord__0_0", __ord__0 AS "__cord__0_1" FROM __d__0`
          + `\n       UNION ALL`
          + `\n       SELECT '1:department,product' AS "__src__0", __d__1."department" AS "__c__0", __d__1."product" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __sord__1 AS "__cord__0_0", __ord__1 AS "__cord__0_1" FROM __d__1`
          + `\n     )`
          + `\nSELECT __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON (`
          + `\n    (__d__2."__src__0" = '0:region,country,city' AND T."region" = __d__2."__c__0" AND (T."country" = __d__2."__c__1" OR __d__2."__c__1" IS NULL) AND (T."city" = __d__2."__c__2" OR __d__2."__c__2" IS NULL))`
          + `\n    OR (__d__2."__src__0" = '1:department,product' AND T."department" = __d__2."__c__0" AND (T."product" = __d__2."__c__1" OR __d__2."__c__1" IS NULL))`
          + `\n    OR __d__2."__src__0" IS NULL`
          + `\n  ) GROUP BY __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", __d__2."__src__0" ORDER BY __d__2."__src__0", MIN(__d__2."__cord__0_0"), MIN(__d__2."__cord__0_1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe", "Electronics", "Apparel"],
          [null, "UK", "Germany", null, null],
          [null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 3350, 4030, 13800, 3400],
        ]);
      });
    });

    describe("selective expand Electronics — only product branch expands", () => {
      const config: PivotConfig = {
        rows: { expr: concatRows, projection: [{ open: ["Electronics"] }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(merged).to.deep.equal({
          dimSpec: {
            type: "concat",
            children: [
              {
                type: "hierarchy",
                fields: ["region", "country", "city"],
                filter: [],
                segments: [
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Electronics"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["Electronics"] }] } },
                ],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                filter: [],
                segments: [
                  { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Electronics"] }], fail: [] } },
                  { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Electronics"] }] } },
                ],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Electronics') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Electronics'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Electronics') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Electronics'), FALSE)) GROUP BY "department"`
          + `\n     ),`
          + `\n     __d__2 AS (`
          + `\n       SELECT '0:region,country,city' AS "__src__0", __d__0."region" AS "__c__0", __d__0."country" AS "__c__1", __d__0."city" AS "__c__2", __sord__0 AS "__cord__0_0", __ord__0 AS "__cord__0_1" FROM __d__0`
          + `\n       UNION ALL`
          + `\n       SELECT '1:department,product' AS "__src__0", __d__1."department" AS "__c__0", __d__1."product" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __sord__1 AS "__cord__0_0", __ord__1 AS "__cord__0_1" FROM __d__1`
          + `\n     )`
          + `\nSELECT __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON (`
          + `\n    (__d__2."__src__0" = '0:region,country,city' AND T."region" = __d__2."__c__0" AND (T."country" = __d__2."__c__1" OR __d__2."__c__1" IS NULL) AND (T."city" = __d__2."__c__2" OR __d__2."__c__2" IS NULL))`
          + `\n    OR (__d__2."__src__0" = '1:department,product' AND T."department" = __d__2."__c__0" AND (T."product" = __d__2."__c__1" OR __d__2."__c__1" IS NULL))`
          + `\n    OR __d__2."__src__0" IS NULL`
          + `\n  ) GROUP BY __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", __d__2."__src__0" ORDER BY __d__2."__src__0", MIN(__d__2."__cord__0_0"), MIN(__d__2."__cord__0_1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Electronics", "Electronics", "Apparel"],
          [null, null, "Laptop", "Phone", null],
          [null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 7380, 8850, 4950, 3400],
        ]);
      });
    });

    describe("selective Europe then wildcard — geo branch to city level", () => {
      const config: PivotConfig = {
        rows: { expr: concatRows, projection: [{ open: ["Europe"], next: { open: "*" } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(merged).to.deep.equal({
          dimSpec: {
            type: "concat",
            children: [
              {
                type: "hierarchy",
                fields: ["region", "country", "city"],
                filter: [],
                segments: [
                  { groupBy: ["region", "country", "city"], filter: { pass: [{ field: "region", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["Europe"] }] } },
                ],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                filter: [],
                segments: [
                  { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Europe"] }] } },
                ],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Europe') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Europe'), FALSE)) GROUP BY "department"`
          + `\n     ),`
          + `\n     __d__2 AS (`
          + `\n       SELECT '0:region,country,city' AS "__src__0", __d__0."region" AS "__c__0", __d__0."country" AS "__c__1", __d__0."city" AS "__c__2", __sord__0 AS "__cord__0_0", __ord__0 AS "__cord__0_1" FROM __d__0`
          + `\n       UNION ALL`
          + `\n       SELECT '1:department,product' AS "__src__0", __d__1."department" AS "__c__0", __d__1."product" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __sord__1 AS "__cord__0_0", __ord__1 AS "__cord__0_1" FROM __d__1`
          + `\n     )`
          + `\nSELECT __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON (`
          + `\n    (__d__2."__src__0" = '0:region,country,city' AND T."region" = __d__2."__c__0" AND (T."country" = __d__2."__c__1" OR __d__2."__c__1" IS NULL) AND (T."city" = __d__2."__c__2" OR __d__2."__c__2" IS NULL))`
          + `\n    OR (__d__2."__src__0" = '1:department,product' AND T."department" = __d__2."__c__0" AND (T."product" = __d__2."__c__1" OR __d__2."__c__1" IS NULL))`
          + `\n    OR __d__2."__src__0" IS NULL`
          + `\n  ) GROUP BY __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", __d__2."__src__0" ORDER BY __d__2."__src__0", MIN(__d__2."__cord__0_0"), MIN(__d__2."__cord__0_1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe",
            "Electronics", "Apparel"],
          [null, "UK", "Germany",
            null, null],
          [null, "London", "Berlin", null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 3350, 4030, 13800, 3400],
        ]);
      });
    });

    describe("two paths — Europe expands geo branch, Electronics expands product branch", () => {
      const config: PivotConfig = {
        rows: { expr: concatRows, projection: [{ open: ["Europe"] }, { open: ["Electronics"] }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(merged).to.deep.equal({
          dimSpec: {
            type: "concat",
            children: [
              {
                type: "hierarchy",
                fields: ["region", "country", "city"],
                filter: [],
                segments: [
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Electronics"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["Europe", "Electronics"] }] } },
                ],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                filter: [],
                segments: [
                  { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Electronics"] }], fail: [] } },
                  { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Europe", "Electronics"] }] } },
                ],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum", filter: [] }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Electronics') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe','Electronics'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Europe') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Electronics') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Europe','Electronics'), FALSE)) GROUP BY "department"`
          + `\n     ),`
          + `\n     __d__2 AS (`
          + `\n       SELECT '0:region,country,city' AS "__src__0", __d__0."region" AS "__c__0", __d__0."country" AS "__c__1", __d__0."city" AS "__c__2", __sord__0 AS "__cord__0_0", __ord__0 AS "__cord__0_1" FROM __d__0`
          + `\n       UNION ALL`
          + `\n       SELECT '1:department,product' AS "__src__0", __d__1."department" AS "__c__0", __d__1."product" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __sord__1 AS "__cord__0_0", __ord__1 AS "__cord__0_1" FROM __d__1`
          + `\n     )`
          + `\nSELECT __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON (`
          + `\n    (__d__2."__src__0" = '0:region,country,city' AND T."region" = __d__2."__c__0" AND (T."country" = __d__2."__c__1" OR __d__2."__c__1" IS NULL) AND (T."city" = __d__2."__c__2" OR __d__2."__c__2" IS NULL))`
          + `\n    OR (__d__2."__src__0" = '1:department,product' AND T."department" = __d__2."__c__0" AND (T."product" = __d__2."__c__1" OR __d__2."__c__1" IS NULL))`
          + `\n    OR __d__2."__src__0" IS NULL`
          + `\n  ) GROUP BY __d__2."__c__0", __d__2."__c__1", __d__2."__c__2", __d__2."__src__0" ORDER BY __d__2."__src__0", MIN(__d__2."__cord__0_0"), MIN(__d__2."__cord__0_1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe", "Electronics", "Electronics", "Apparel"],
          [null, "UK", "Germany", "Laptop", "Phone", null],
          [null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 3350, 4030, 8850, 4950, 3400],
        ]);
      });
    });
  });

  describe("cross simple with hierarchy — projection only affects hierarchy child", () => {
    const crossRegHier = cross("region", hierarchy("department", "product"));

    describe("base state — region visible, department collapsed", () => {
      const config: PivotConfig = {
        rows: { expr: crossRegHier, projection: [] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"simple","field":"region","filter":[]},{"type":"hierarchy","fields":["department","product"],"filter":[]}],"segments":[{"visibleChildren":1}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
          + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__2 AS (SELECT __d__0.*, CAST(NULL AS VARCHAR) AS "department", CAST(NULL AS VARCHAR) AS "product", 0 AS "__ord__1" FROM __d__0)`
          + `\nSELECT __d__2."region", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND (T."department" = __d__2."department" OR __d__2."department" IS NULL) AND (T."product" = __d__2."product" OR __d__2."product" IS NULL)`
          + ` GROUP BY __d__2."region", __d__2."department", __d__2."product"`
          + ` ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe"],
          [null, null],
          [null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 7380],
        ]);
      });
    });

    describe("wildcard expand — department visible as second level", () => {
      const config: PivotConfig = {
        rows: { expr: crossRegHier, projection: [{ open: "*" }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"simple","field":"region","filter":[]},{"type":"hierarchy","fields":["department","product"],"filter":[],"segments":[{"groupBy":["department"]}]}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
          + `\n     __d__1 AS (SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
          + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)`
          + `\nSELECT __d__2."region", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND T."department" = __d__2."department" AND (T."product" = __d__2."product" OR __d__2."product" IS NULL)`
          + ` GROUP BY __d__2."region", __d__2."department", __d__2."product"`
          + ` ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "Europe", "Europe"],
          ["Electronics", "Apparel", "Electronics", "Apparel"],
          [null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [8150, 1670, 5650, 1730],
        ]);
      });
    });

    describe("wildcard two levels — department and product both visible", () => {
      const config: PivotConfig = {
        rows: { expr: crossRegHier, projection: [{ open: "*", next: { open: "*" } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"simple","field":"region","filter":[]},{"type":"hierarchy","fields":["department","product"],"filter":[]}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
          + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)`
          + `\nSELECT __d__2."region", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND T."department" = __d__2."department" AND T."product" = __d__2."product"`
          + ` GROUP BY __d__2."region", __d__2."department", __d__2."product"`
          + ` ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "North America", "North America", "Europe", "Europe", "Europe", "Europe"],
          ["Electronics", "Electronics", "Apparel", "Apparel", "Electronics", "Electronics", "Apparel", "Apparel"],
          ["Laptop", "Phone", "Jacket", "Shoes", "Laptop", "Phone", "Jacket", "Shoes"],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [4800, 3350, 1220, 450, 4050, 1600, 1130, 600],
        ]);
      });
    });

    describe("wildcard then selective Electronics — only Electronics expands to product", () => {
      const config: PivotConfig = {
        rows: { expr: crossRegHier, projection: [{ open: "*", next: { open: ["Electronics"] } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"simple","field":"region","filter":[]},{"type":"hierarchy","fields":["department","product"],"filter":[],"segments":[{"groupBy":["department","product"],"filter":{"pass":[{"field":"department","values":["Electronics"]}],"fail":[]}},{"groupBy":["department"],"filter":{"pass":[],"fail":[{"field":"department","values":["Electronics"]}]}}]}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Electronics') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Electronics'), FALSE)) GROUP BY "department"`
          + `\n     ),`
          + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1)`
          + `\nSELECT __d__2."region", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND T."department" = __d__2."department" AND (T."product" = __d__2."product" OR __d__2."product" IS NULL) GROUP BY __d__2."region", __d__2."department", __d__2."product" ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__sord__1"), MIN(__d__2."__ord__1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "North America", "Europe", "Europe", "Europe"],
          ["Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel"],
          ["Laptop", "Phone", null, "Laptop", "Phone", null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [4800, 3350, 1670, 4050, 1600, 1730],
        ]);
      });
    });

    describe("both axes — row wildcard expand, column hierarchy base state", () => {
      const config: PivotConfig = {
        rows: { expr: crossRegHier, projection: [{ open: "*" }] },
        columns: { expr: cross(hierarchy("channel", "quarter"), concat("revenue", "cost")), projection: [] },
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"cross","children":[{"type":"simple","field":"region","filter":[]},{"type":"hierarchy","fields":["department","product"],"filter":[],"segments":[{"groupBy":["department"]}]}],"filter":[]},{"type":"cross","children":[{"type":"hierarchy","fields":["channel","quarter"],"filter":[],"segments":[{"groupBy":["channel"]}]}],"filter":[]}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]},{"field":"cost","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
          + `\n     __d__1 AS (SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
          + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1),`
          + `\n     __d__3 AS (SELECT "channel", CAST(NULL AS VARCHAR) AS "quarter", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "channel"),`
          + `\n     __d__4 AS (SELECT * FROM __d__2 CROSS JOIN __d__3)`
          + `\nSELECT __d__4."region", __d__4."department", __d__4."product", __d__4."channel", __d__4."quarter", SUM(T."revenue") AS "revenue", SUM(T."cost") AS "cost"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND T."department" = __d__4."department" AND (T."product" = __d__4."product" OR __d__4."product" IS NULL) AND T."channel" = __d__4."channel" AND (T."quarter" = __d__4."quarter" OR __d__4."quarter" IS NULL)`
          + ` GROUP BY __d__4."region", __d__4."department", __d__4."product", __d__4."channel", __d__4."quarter"`
          + ` ORDER BY MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__3")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "Europe", "Europe"],
          ["Electronics", "Apparel", "Electronics", "Apparel"],
          [null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([
          ["Online", "Online", "Retail", "Retail", "Wholesale", "Wholesale"],
          [null, null, null, null, null, null],
          ["revenue", "cost", "revenue", "cost", "revenue", "cost"],
        ]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [6450, 550, 2700, 680],
          [4280, 270, 1830, 335],
          [1700, 630, 2200, 1050],
          [1050, 315, 1420, 520],
          [null, 490, 750, null],
          [null, 245, 480, null],
        ]);
      });
    });
  });

  describe("nested cross with hierarchy — projection drills through cross levels then into hierarchy", () => {
    const nestedCrossRows = cross(cross("channel", "quarter"), hierarchy("department", "product"));

    describe("base state — channel only, quarter and hierarchy hidden", () => {
      const config: PivotConfig = {
        rows: { expr: nestedCrossRows, projection: [] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"cross","children":[{"type":"simple","field":"channel","filter":[]},{"type":"simple","field":"quarter","filter":[]}],"segments":[{"visibleChildren":1}],"filter":[]},{"type":"hierarchy","fields":["department","product"],"filter":[]}],"segments":[{"visibleChildren":1}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "channel", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "channel"),`
          + `\n     __d__1 AS (SELECT "quarter", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "quarter"),`
          + `\n     __d__2 AS (SELECT __d__0.*, CAST(NULL AS VARCHAR) AS "quarter", 0 AS "__ord__1" FROM __d__0),`
          + `\n     __d__3 AS (SELECT "department", "product", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__4 AS (SELECT __d__2.*, CAST(NULL AS VARCHAR) AS "department", CAST(NULL AS VARCHAR) AS "product", 0 AS "__ord__3" FROM __d__2)`
          + `\nSELECT __d__4."channel", __d__4."quarter", __d__4."department", __d__4."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."channel" = __d__4."channel" AND (T."quarter" = __d__4."quarter" OR __d__4."quarter" IS NULL) AND (T."department" = __d__4."department" OR __d__4."department" IS NULL) AND (T."product" = __d__4."product" OR __d__4."product" IS NULL)`
          + ` GROUP BY __d__4."channel", __d__4."quarter", __d__4."department", __d__4."product"`
          + ` ORDER BY MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__3")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["Online", "Retail", "Wholesale"],
          [null, null, null],
          [null, null, null],
          [null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [10380, 5580, 1240],
        ]);
      });
    });

    describe("one level expand — channel x quarter visible, hierarchy still hidden", () => {
      const config: PivotConfig = {
        rows: { expr: nestedCrossRows, projection: [{ open: "*" }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"cross","children":[{"type":"simple","field":"channel","filter":[]},{"type":"simple","field":"quarter","filter":[]}],"filter":[]},{"type":"hierarchy","fields":["department","product"],"filter":[]}],"segments":[{"visibleChildren":1}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "channel", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "channel"),`
          + `\n     __d__1 AS (SELECT "quarter", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "quarter"),`
          + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1),`
          + `\n     __d__3 AS (SELECT "department", "product", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__4 AS (SELECT __d__2.*, CAST(NULL AS VARCHAR) AS "department", CAST(NULL AS VARCHAR) AS "product", 0 AS "__ord__3" FROM __d__2)`
          + `\nSELECT __d__4."channel", __d__4."quarter", __d__4."department", __d__4."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."channel" = __d__4."channel" AND T."quarter" = __d__4."quarter" AND (T."department" = __d__4."department" OR __d__4."department" IS NULL) AND (T."product" = __d__4."product" OR __d__4."product" IS NULL)`
          + ` GROUP BY __d__4."channel", __d__4."quarter", __d__4."department", __d__4."product"`
          + ` ORDER BY MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__3")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["Online", "Online", "Online", "Retail", "Retail", "Retail", "Wholesale", "Wholesale", "Wholesale"],
          ["Q1", "Q2", "Q3", "Q1", "Q2", "Q3", "Q1", "Q2", "Q3"],
          [null, null, null, null, null, null, null, null, null],
          [null, null, null, null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [6550, 2880, 950, 2280, 1570, 1730, null, 950, 290],
        ]);
      });
    });

    describe("two level expand — channel x quarter x department visible", () => {
      const config: PivotConfig = {
        rows: { expr: nestedCrossRows, projection: [{ open: "*", next: { open: "*" } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"cross","children":[{"type":"simple","field":"channel","filter":[]},{"type":"simple","field":"quarter","filter":[]}],"filter":[]},{"type":"hierarchy","fields":["department","product"],"filter":[],"segments":[{"groupBy":["department"]}]}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "channel", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "channel"),`
          + `\n     __d__1 AS (SELECT "quarter", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "quarter"),`
          + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1),`
          + `\n     __d__3 AS (SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "department"),`
          + `\n     __d__4 AS (SELECT * FROM __d__2 CROSS JOIN __d__3)`
          + `\nSELECT __d__4."channel", __d__4."quarter", __d__4."department", __d__4."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."channel" = __d__4."channel" AND T."quarter" = __d__4."quarter" AND T."department" = __d__4."department" AND (T."product" = __d__4."product" OR __d__4."product" IS NULL)`
          + ` GROUP BY __d__4."channel", __d__4."quarter", __d__4."department", __d__4."product"`
          + ` ORDER BY MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__3")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["Online", "Online", "Online", "Online", "Online", "Online", "Retail", "Retail", "Retail", "Retail", "Retail", "Retail", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale"],
          ["Q1", "Q1", "Q2", "Q2", "Q3", "Q3", "Q1", "Q1", "Q2", "Q2", "Q3", "Q3", "Q1", "Q1", "Q2", "Q2", "Q3", "Q3"],
          ["Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel"],
          [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [6000, 550, 2200, 680, 950, null, 1650, 630, 900, 670, 1350, 380, null, null, 750, 200, null, 290],
        ]);
      });
    });

    describe("three level expand, selective Electronics — Electronics shows product", () => {
      const config: PivotConfig = {
        rows: { expr: nestedCrossRows, projection: [{ open: "*", next: { open: "*", next: { open: ["Electronics"] } } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"cross","children":[{"type":"simple","field":"channel","filter":[]},{"type":"simple","field":"quarter","filter":[]}],"filter":[]},{"type":"hierarchy","fields":["department","product"],"filter":[],"segments":[{"groupBy":["department","product"],"filter":{"pass":[{"field":"department","values":["Electronics"]}],"fail":[]}},{"groupBy":["department"],"filter":{"pass":[],"fail":[{"field":"department","values":["Electronics"]}]}}]}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "channel", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "channel"),`
          + `\n     __d__1 AS (SELECT "quarter", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "quarter"),`
          + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1),`
          + `\n     __d__3 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__3", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__3" FROM "data" WHERE "department" IN ('Electronics') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__3", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__3" FROM "data" WHERE NOT (COALESCE("department" IN ('Electronics'), FALSE)) GROUP BY "department"`
          + `\n     ),`
          + `\n     __d__4 AS (SELECT * FROM __d__2 CROSS JOIN __d__3)`
          + `\nSELECT __d__4."channel", __d__4."quarter", __d__4."department", __d__4."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."channel" = __d__4."channel" AND T."quarter" = __d__4."quarter" AND T."department" = __d__4."department" AND (T."product" = __d__4."product" OR __d__4."product" IS NULL) GROUP BY __d__4."channel", __d__4."quarter", __d__4."department", __d__4."product" ORDER BY MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__sord__3"), MIN(__d__4."__ord__3")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["Online", "Online", "Online", "Online", "Online", "Online", "Online", "Online", "Online", "Retail", "Retail", "Retail", "Retail", "Retail", "Retail", "Retail", "Retail", "Retail", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale"],
          ["Q1", "Q1", "Q1", "Q2", "Q2", "Q2", "Q3", "Q3", "Q3", "Q1", "Q1", "Q1", "Q2", "Q2", "Q2", "Q3", "Q3", "Q3", "Q1", "Q1", "Q1", "Q2", "Q2", "Q2", "Q3", "Q3", "Q3"],
          ["Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel"],
          ["Laptop", "Phone", null, "Laptop", "Phone", null, "Laptop", "Phone", null, "Laptop", "Phone", null, "Laptop", "Phone", null, "Laptop", "Phone", null, "Laptop", "Phone", null, "Laptop", "Phone", null, "Laptop", "Phone", null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [6000, null, 550, 1500, 700, 680, null, 950, null, null, 1650, 630, null, 900, 670, 1350, null, 380, null, null, null, null, 750, 200, null, null, 290],
        ]);
      });
    });
  });

  describe("cross two hierarchies — selective gating between children", () => {
    const crossHierHierRows = cross(hierarchy("region", "country"), hierarchy("department", "product"));

    describe("Europe expanded to country — child 1 still hidden (gate not reached)", () => {
      const config: PivotConfig = {
        rows: { expr: crossHierHierRows, projection: [{ open: ["Europe"], next: { open: "*" } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"hierarchy","fields":["region","country"],"filter":[],"segments":[{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]}]}}]},{"type":"hierarchy","fields":["department","product"],"filter":[],"segments":[{"groupBy":["department"]}]}],"segments":[{"visibleChildren":2,"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"visibleChildren":1,"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]}]}}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
          + `\n     __d__2 AS (`
          + `\n       SELECT __d__0."region", __d__0."country", __d__1."department", __d__1."product", __d__0."__sord__0", __d__0."__ord__0", __d__1."__ord__1" FROM __d__0 CROSS JOIN __d__1 WHERE __d__0."region" IN ('Europe')`
          + `\n       UNION ALL`
          + `\n       SELECT __d__0."region", __d__0."country", CAST(NULL AS VARCHAR) AS "department", CAST(NULL AS VARCHAR) AS "product", __d__0."__sord__0", __d__0."__ord__0", 0 AS "__ord__1" FROM __d__0 WHERE NOT (COALESCE(__d__0."region" IN ('Europe'), FALSE))`
          + `\n     )`
          + `\nSELECT __d__2."region", __d__2."country", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND (T."country" = __d__2."country" OR __d__2."country" IS NULL) AND (T."department" = __d__2."department" OR __d__2."department" IS NULL) AND (T."product" = __d__2."product" OR __d__2."product" IS NULL) GROUP BY __d__2."region", __d__2."country", __d__2."department", __d__2."product" ORDER BY MIN(__d__2."__sord__0"), MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe", "Europe", "Europe"],
          [null, "UK", "UK", "Germany", "Germany"],
          [null, "Electronics", "Apparel", "Electronics", "Apparel"],
          [null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 2250, 1100, 3400, 630],
        ]);
      });
    });

    describe("Europe wildcard + NA selective USA — two paths, child 1 still gated", () => {
      const config: PivotConfig = {
        rows: { expr: crossHierHierRows, projection: [{ open: ["Europe"], next: { open: "*" } }, { open: ["North America"], next: { open: ["USA"] } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"hierarchy","fields":["region","country"],"filter":[],"segments":[{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["North America"]},{"field":"country","values":["USA"]}],"fail":[]}},{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["North America"]}],"fail":[{"field":"country","values":["USA"]}]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe","North America"]}]}}]},{"type":"hierarchy","fields":["department","product"],"filter":[],"segments":[{"groupBy":["department"]}]}],"segments":[{"visibleChildren":2,"filter":{"pass":[{"field":"region","values":["Europe","North America"]}],"fail":[]}},{"visibleChildren":1,"filter":{"pass":[],"fail":[{"field":"region","values":["Europe","North America"]}]}}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND "country" IN ('USA') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND NOT (COALESCE("country" IN ('USA'), FALSE)) GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe','North America'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
          + `\n     __d__2 AS (`
          + `\n       SELECT __d__0."region", __d__0."country", __d__1."department", __d__1."product", __d__0."__sord__0", __d__0."__ord__0", __d__1."__ord__1" FROM __d__0 CROSS JOIN __d__1 WHERE __d__0."region" IN ('Europe','North America')`
          + `\n       UNION ALL`
          + `\n       SELECT __d__0."region", __d__0."country", CAST(NULL AS VARCHAR) AS "department", CAST(NULL AS VARCHAR) AS "product", __d__0."__sord__0", __d__0."__ord__0", 0 AS "__ord__1" FROM __d__0 WHERE NOT (COALESCE(__d__0."region" IN ('Europe','North America'), FALSE))`
          + `\n     )`
          + `\nSELECT __d__2."region", __d__2."country", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND (T."country" = __d__2."country" OR __d__2."country" IS NULL) AND (T."department" = __d__2."department" OR __d__2."department" IS NULL) AND (T."product" = __d__2."product" OR __d__2."product" IS NULL) GROUP BY __d__2."region", __d__2."country", __d__2."department", __d__2."product" ORDER BY MIN(__d__2."__sord__0"), MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "North America", "North America", "Europe", "Europe", "Europe", "Europe"],
          ["USA", "USA", "Canada", "Canada", "UK", "UK", "Germany", "Germany"],
          ["Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel"],
          [null, null, null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [6450, 1190, 1700, 480, 2250, 1100, 3400, 630],
        ]);
      });
    });
  });

  describe("concat of two crosses — projection drills into each cross branch independently", () => {
    const deepRows = concat(
      cross(hierarchy("region", "country"), "department"),
      cross("channel", "department"),
    );

    describe("base state — region and channel visible, hierarchy children hidden", () => {
      const config: PivotConfig = {
        rows: { expr: deepRows, projection: [] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"concat","children":[{"type":"cross","children":[{"type":"hierarchy","fields":["region","country"],"filter":[],"segments":[{"groupBy":["region"]}]},{"type":"simple","field":"department","filter":[]}],"segments":[{"visibleChildren":1}],"filter":[]},{"type":"cross","children":[{"type":"simple","field":"channel","filter":[]},{"type":"simple","field":"department","filter":[]}],"segments":[{"visibleChildren":1}],"filter":[]}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", CAST(NULL AS VARCHAR) AS "country", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
          + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
          + `\n     __d__2 AS (SELECT __d__0.*, CAST(NULL AS VARCHAR) AS "department", 0 AS "__ord__1" FROM __d__0),`
          + `\n     __d__3 AS (SELECT "channel", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "channel"),`
          + `\n     __d__4 AS (SELECT "department", MIN(rowid) AS "__ord__4" FROM "data" GROUP BY "department"),`
          + `\n     __d__5 AS (SELECT __d__3.*, CAST(NULL AS VARCHAR) AS "department", 0 AS "__ord__4" FROM __d__3),`
          + `\n     __d__6 AS (`
          + `\n       SELECT '0:region,country,department' AS "__src__0", __d__2."region" AS "__c__0", __d__2."country" AS "__c__1", __d__2."department" AS "__c__2", __ord__0 AS "__cord__0_0", __ord__1 AS "__cord__0_1" FROM __d__2`
          + `\n       UNION ALL`
          + `\n       SELECT '1:channel,department' AS "__src__0", __d__5."channel" AS "__c__0", __d__5."department" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __ord__3 AS "__cord__0_0", __ord__4 AS "__cord__0_1" FROM __d__5`
          + `\n     )`
          + `\nSELECT __d__6."__c__0", __d__6."__c__1", __d__6."__c__2", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__6`
          + `\nLEFT JOIN "data" T ON (`
          + `\n    (__d__6."__src__0" = '0:region,country,department' AND T."region" = __d__6."__c__0" AND (T."country" = __d__6."__c__1" OR __d__6."__c__1" IS NULL) AND (T."department" = __d__6."__c__2" OR __d__6."__c__2" IS NULL))`
          + `\n    OR (__d__6."__src__0" = '1:channel,department' AND T."channel" = __d__6."__c__0" AND (T."department" = __d__6."__c__1" OR __d__6."__c__1" IS NULL))`
          + `\n    OR __d__6."__src__0" IS NULL`
          + `\n  )`
          + ` GROUP BY __d__6."__c__0", __d__6."__c__1", __d__6."__c__2", __d__6."__src__0"`
          + ` ORDER BY __d__6."__src__0", MIN(__d__6."__cord__0_0"), MIN(__d__6."__cord__0_1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Online", "Retail", "Wholesale"],
          [null, null, null, null, null],
          [null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 7380, 10380, 5580, 1240],
        ]);
      });
    });

    describe("wildcard expand — geo branch shows country+dept, channel branch shows dept", () => {
      const config: PivotConfig = {
        rows: { expr: deepRows, projection: [{ open: "*" }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"concat","children":[{"type":"cross","children":[{"type":"hierarchy","fields":["region","country"],"filter":[]},{"type":"simple","field":"department","filter":[]}],"segments":[{"visibleChildren":1}],"filter":[]},{"type":"cross","children":[{"type":"simple","field":"channel","filter":[]},{"type":"simple","field":"department","filter":[]}],"filter":[]}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", "country", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country"),`
          + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
          + `\n     __d__2 AS (SELECT __d__0.*, CAST(NULL AS VARCHAR) AS "department", 0 AS "__ord__1" FROM __d__0),`
          + `\n     __d__3 AS (SELECT "channel", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "channel"),`
          + `\n     __d__4 AS (SELECT "department", MIN(rowid) AS "__ord__4" FROM "data" GROUP BY "department"),`
          + `\n     __d__5 AS (SELECT * FROM __d__3 CROSS JOIN __d__4),`
          + `\n     __d__6 AS (`
          + `\n       SELECT '0:region,country,department' AS "__src__0", __d__2."region" AS "__c__0", __d__2."country" AS "__c__1", __d__2."department" AS "__c__2", __ord__0 AS "__cord__0_0", __ord__1 AS "__cord__0_1" FROM __d__2`
          + `\n       UNION ALL`
          + `\n       SELECT '1:channel,department' AS "__src__0", __d__5."channel" AS "__c__0", __d__5."department" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __ord__3 AS "__cord__0_0", __ord__4 AS "__cord__0_1" FROM __d__5`
          + `\n     )`
          + `\nSELECT __d__6."__c__0", __d__6."__c__1", __d__6."__c__2", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__6`
          + `\nLEFT JOIN "data" T ON (`
          + `\n    (__d__6."__src__0" = '0:region,country,department' AND T."region" = __d__6."__c__0" AND T."country" = __d__6."__c__1" AND (T."department" = __d__6."__c__2" OR __d__6."__c__2" IS NULL))`
          + `\n    OR (__d__6."__src__0" = '1:channel,department' AND T."channel" = __d__6."__c__0" AND T."department" = __d__6."__c__1")`
          + `\n    OR __d__6."__src__0" IS NULL`
          + `\n  )`
          + ` GROUP BY __d__6."__c__0", __d__6."__c__1", __d__6."__c__2", __d__6."__src__0"`
          + ` ORDER BY __d__6."__src__0", MIN(__d__6."__cord__0_0"), MIN(__d__6."__cord__0_1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "Europe", "Europe", "Online", "Online", "Retail", "Retail", "Wholesale", "Wholesale"],
          ["USA", "Canada", "UK", "Germany", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel"],
          [null, null, null, null, null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [7640, 2180, 3350, 4030, 9150, 1230, 3900, 1680, 750, 490],
        ]);
      });
    });

    describe("wildcard two levels — fully expanded both branches", () => {
      const config: PivotConfig = {
        rows: { expr: deepRows, projection: [{ open: "*", next: { open: "*" } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"concat","children":[{"type":"cross","children":[{"type":"hierarchy","fields":["region","country"],"filter":[]},{"type":"simple","field":"department","filter":[]}],"filter":[]},{"type":"cross","children":[{"type":"simple","field":"channel","filter":[]},{"type":"simple","field":"department","filter":[]}],"filter":[]}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", "country", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region", "country"),`
          + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
          + `\n     __d__2 AS (SELECT * FROM __d__0 CROSS JOIN __d__1),`
          + `\n     __d__3 AS (SELECT "channel", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "channel"),`
          + `\n     __d__4 AS (SELECT "department", MIN(rowid) AS "__ord__4" FROM "data" GROUP BY "department"),`
          + `\n     __d__5 AS (SELECT * FROM __d__3 CROSS JOIN __d__4),`
          + `\n     __d__6 AS (`
          + `\n       SELECT '0:region,country,department' AS "__src__0", __d__2."region" AS "__c__0", __d__2."country" AS "__c__1", __d__2."department" AS "__c__2", __ord__0 AS "__cord__0_0", __ord__1 AS "__cord__0_1" FROM __d__2`
          + `\n       UNION ALL`
          + `\n       SELECT '1:channel,department' AS "__src__0", __d__5."channel" AS "__c__0", __d__5."department" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __ord__3 AS "__cord__0_0", __ord__4 AS "__cord__0_1" FROM __d__5`
          + `\n     )`
          + `\nSELECT __d__6."__c__0", __d__6."__c__1", __d__6."__c__2", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__6`
          + `\nLEFT JOIN "data" T ON (`
          + `\n    (__d__6."__src__0" = '0:region,country,department' AND T."region" = __d__6."__c__0" AND T."country" = __d__6."__c__1" AND T."department" = __d__6."__c__2")`
          + `\n    OR (__d__6."__src__0" = '1:channel,department' AND T."channel" = __d__6."__c__0" AND T."department" = __d__6."__c__1")`
          + `\n    OR __d__6."__src__0" IS NULL`
          + `\n  )`
          + ` GROUP BY __d__6."__c__0", __d__6."__c__1", __d__6."__c__2", __d__6."__src__0"`
          + ` ORDER BY __d__6."__src__0", MIN(__d__6."__cord__0_0"), MIN(__d__6."__cord__0_1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "North America", "North America", "Europe", "Europe", "Europe", "Europe", "Online", "Online", "Retail", "Retail", "Wholesale", "Wholesale"],
          ["USA", "USA", "Canada", "Canada", "UK", "UK", "Germany", "Germany", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel"],
          ["Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel", null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [6450, 1190, 1700, 480, 2250, 1100, 3400, 630, 9150, 1230, 3900, 1680, 750, 490],
        ]);
      });
    });

    describe("selective Europe — only geo branch Europe rows expand", () => {
      const config: PivotConfig = {
        rows: { expr: deepRows, projection: [{ open: ["Europe"] }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"concat","children":[{"type":"cross","children":[{"type":"hierarchy","fields":["region","country"],"filter":[],"segments":[{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]}]}}]},{"type":"simple","field":"department","filter":[]}],"segments":[{"visibleChildren":1}],"filter":[]},{"type":"cross","children":[{"type":"simple","field":"channel","filter":[]},{"type":"simple","field":"department","filter":[]}],"filter":[]}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (SELECT "department", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
          + `\n     __d__2 AS (SELECT __d__0.*, CAST(NULL AS VARCHAR) AS "department", 0 AS "__ord__1" FROM __d__0),`
          + `\n     __d__3 AS (SELECT "channel", MIN(rowid) AS "__ord__3" FROM "data" GROUP BY "channel"),`
          + `\n     __d__4 AS (SELECT "department", MIN(rowid) AS "__ord__4" FROM "data" GROUP BY "department"),`
          + `\n     __d__5 AS (SELECT * FROM __d__3 CROSS JOIN __d__4),`
          + `\n     __d__6 AS (`
          + `\n       SELECT '0:region,country,department' AS "__src__0", __d__2."region" AS "__c__0", __d__2."country" AS "__c__1", __d__2."department" AS "__c__2", __sord__0 AS "__cord__0_0", __ord__0 AS "__cord__0_1", __ord__1 AS "__cord__0_2" FROM __d__2`
          + `\n       UNION ALL`
          + `\n       SELECT '1:channel,department' AS "__src__0", __d__5."channel" AS "__c__0", __d__5."department" AS "__c__1", CAST(NULL AS VARCHAR) AS "__c__2", __ord__3 AS "__cord__0_0", __ord__4 AS "__cord__0_1", 0 AS "__cord__0_2" FROM __d__5`
          + `\n     )`
          + `\nSELECT __d__6."__c__0", __d__6."__c__1", __d__6."__c__2", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__6`
          + `\nLEFT JOIN "data" T ON (`
          + `\n    (__d__6."__src__0" = '0:region,country,department' AND T."region" = __d__6."__c__0" AND (T."country" = __d__6."__c__1" OR __d__6."__c__1" IS NULL) AND (T."department" = __d__6."__c__2" OR __d__6."__c__2" IS NULL))`
          + `\n    OR (__d__6."__src__0" = '1:channel,department' AND T."channel" = __d__6."__c__0" AND T."department" = __d__6."__c__1")`
          + `\n    OR __d__6."__src__0" IS NULL`
          + `\n  ) GROUP BY __d__6."__c__0", __d__6."__c__1", __d__6."__c__2", __d__6."__src__0" ORDER BY __d__6."__src__0", MIN(__d__6."__cord__0_0"), MIN(__d__6."__cord__0_1"), MIN(__d__6."__cord__0_2")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe", "Online", "Online", "Retail", "Retail", "Wholesale", "Wholesale"],
          [null, "UK", "Germany", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel"],
          [null, null, null, null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 3350, 4030, 9150, 1230, 3900, 1680, 750, 490],
        ]);
      });
    });
  });

  describe("cross hierarchy with concat child — gating + concat branch expansion", () => {
    describe("NA drills to city then selective Electronics, Europe at country level", () => {
      const config: PivotConfig = {
        rows: {
          expr: cross(
            hierarchy("region", "country", "city"),
            concat(hierarchy("department", "product"), "channel"),
          ),
          projection: [
            { open: ["North America"], next: { open: ["USA"], next: { open: "*", next: { open: ["Electronics"] } } } },
            { open: ["Europe"] },
          ],
        },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"hierarchy","fields":["region","country","city"],"filter":[],"segments":[{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["North America"]},{"field":"country","values":["USA"]}],"fail":[]}},{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["North America"]}],"fail":[{"field":"country","values":["USA"]}]}},{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["North America","Europe"]}]}}]},{"type":"concat","children":[{"type":"hierarchy","fields":["department","product"],"filter":[],"segments":[{"groupBy":["department","product"],"filter":{"pass":[{"field":"department","values":["Electronics"]}],"fail":[]}},{"groupBy":["department"],"filter":{"pass":[],"fail":[{"field":"department","values":["Electronics"]}]}}]},{"type":"simple","field":"channel","filter":[]}]}],"segments":[{"visibleChildren":2,"filter":{"pass":[{"field":"region","values":["North America","Europe"]},{"field":"country","values":["USA"]}],"fail":[]}},{"visibleChildren":1,"filter":{"pass":[],"fail":[{"field":"region","values":["North America","Europe"]},{"field":"country","values":["USA"]}]}}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND "country" IN ('USA') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND NOT (COALESCE("country" IN ('USA'), FALSE)) GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('North America','Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Electronics') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Electronics'), FALSE)) GROUP BY "department"`
          + `\n     ),`
          + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
          + `\n     __d__3 AS (`
          + `\n       SELECT '0:department,product' AS "__src__0", __d__1."department" AS "__c__0", __d__1."product" AS "__c__1", __sord__1 AS "__cord__0_0", __ord__1 AS "__cord__0_1" FROM __d__1`
          + `\n       UNION ALL`
          + `\n       SELECT '1:channel' AS "__src__0", __d__2."channel" AS "__c__0", CAST(NULL AS VARCHAR) AS "__c__1", __ord__2 AS "__cord__0_0", 0 AS "__cord__0_1" FROM __d__2`
          + `\n     ),`
          + `\n     __d__4 AS (`
          + `\n       SELECT __d__0."region", __d__0."country", __d__0."city", __d__3."__c__0", __d__3."__c__1", __d__0."__sord__0", __d__0."__ord__0", __d__3."__cord__0_0", __d__3."__cord__0_1", __d__3."__src__0" FROM __d__0 CROSS JOIN __d__3 WHERE __d__0."region" IN ('North America','Europe') AND __d__0."country" IN ('USA')`
          + `\n       UNION ALL`
          + `\n       SELECT __d__0."region", __d__0."country", __d__0."city", CAST(NULL AS VARCHAR) AS "__c__0", CAST(NULL AS VARCHAR) AS "__c__1", __d__0."__sord__0", __d__0."__ord__0", 0 AS "__cord__0_0", 0 AS "__cord__0_1", CAST(NULL AS VARCHAR) AS "__src__0" FROM __d__0 WHERE NOT (COALESCE(__d__0."region" IN ('North America','Europe'), FALSE) AND COALESCE(__d__0."country" IN ('USA'), FALSE))`
          + `\n     )`
          + `\nSELECT __d__4."region", __d__4."country", __d__4."city", __d__4."__c__0", __d__4."__c__1", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (T."country" = __d__4."country" OR __d__4."country" IS NULL) AND (T."city" = __d__4."city" OR __d__4."city" IS NULL) AND (`
          + `\n    (__d__4."__src__0" = '0:department,product' AND T."department" = __d__4."__c__0" AND (T."product" = __d__4."__c__1" OR __d__4."__c__1" IS NULL))`
          + `\n    OR (__d__4."__src__0" = '1:channel' AND T."channel" = __d__4."__c__0")`
          + `\n    OR __d__4."__src__0" IS NULL`
          + `\n  ) GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."__c__0", __d__4."__c__1", __d__4."__src__0" ORDER BY MIN(__d__4."__sord__0"), MIN(__d__4."__ord__0"), __d__4."__src__0", MIN(__d__4."__cord__0_0"), MIN(__d__4."__cord__0_1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "North America", "North America", "North America", "North America", "North America", "North America", "North America", "North America", "North America", "North America", "North America", "Europe", "Europe"],
          ["USA", "USA", "USA", "USA", "USA", "USA", "USA", "USA", "USA", "USA", "USA", "USA", "Canada", "UK", "Germany"],
          ["New York", "New York", "New York", "New York", "New York", "New York", "Chicago", "Chicago", "Chicago", "Chicago", "Chicago", "Chicago", null, null, null],
          ["Electronics", "Electronics", "Apparel", "Online", "Retail", "Wholesale", "Electronics", "Electronics", "Apparel", "Online", "Retail", "Wholesale", null, null, null],
          ["Laptop", "Phone", null, null, null, null, "Laptop", "Phone", null, null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [2700, 1750, 650, 3950, 1150, null, 1100, 900, 540, 1350, 900, 290, 2180, 3350, 4030],
        ]);
      });
    });
  });

  describe("hierarchy 3-level progressive — multiple paths merge at same depth", () => {
    const hierRCC = hierarchy("region", "country", "city");

    describe("Europe expanded to city level", () => {
      const config: PivotConfig = {
        rows: { expr: hierRCC, projection: [{ open: ["Europe"], next: { open: "*" } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"hierarchy","fields":["region","country","city"],"filter":[],"segments":[{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]}]}}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     )`
          + `\nSELECT __d__0."region", __d__0."country", __d__0."city", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__0`
          + `\nLEFT JOIN "data" T ON T."region" = __d__0."region" AND (T."country" = __d__0."country" OR __d__0."country" IS NULL) AND (T."city" = __d__0."city" OR __d__0."city" IS NULL) GROUP BY __d__0."region", __d__0."country", __d__0."city" ORDER BY MIN(__d__0."__sord__0"), MIN(__d__0."__ord__0")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe"],
          [null, "UK", "Germany"],
          [null, "London", "Berlin"],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 3350, 4030],
        ]);
      });
    });

    describe("two paths on same region — wildcard + selective Germany merge", () => {
      const config: PivotConfig = {
        rows: { expr: hierRCC, projection: [{ open: ["Europe"], next: { open: "*" } }, { open: ["Europe"], next: { open: ["Germany"] } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"hierarchy","fields":["region","country","city"],"filter":[],"segments":[{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]}]}}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     )`
          + `\nSELECT __d__0."region", __d__0."country", __d__0."city", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__0`
          + `\nLEFT JOIN "data" T ON T."region" = __d__0."region" AND (T."country" = __d__0."country" OR __d__0."country" IS NULL) AND (T."city" = __d__0."city" OR __d__0."city" IS NULL) GROUP BY __d__0."region", __d__0."country", __d__0."city" ORDER BY MIN(__d__0."__sord__0"), MIN(__d__0."__ord__0")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe"],
          [null, "UK", "Germany"],
          [null, "London", "Berlin"],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 3350, 4030],
        ]);
      });
    });

    describe("three paths — Europe merge + NA/USA to city level", () => {
      const config: PivotConfig = {
        rows: {
          expr: hierRCC,
          projection: [
            { open: ["Europe"], next: { open: "*" } },
            { open: ["Europe"], next: { open: ["Germany"] } },
            { open: ["North America"], next: { open: ["USA"], next: { open: "*" } } },
          ],
        },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"hierarchy","fields":["region","country","city"],"filter":[],"segments":[{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["North America"]},{"field":"country","values":["USA"]}],"fail":[]}},{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["North America"]}],"fail":[{"field":"country","values":["USA"]}]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe","North America"]}]}}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND "country" IN ('USA') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND NOT (COALESCE("country" IN ('USA'), FALSE)) GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe','North America'), FALSE)) GROUP BY "region"`
          + `\n     )`
          + `\nSELECT __d__0."region", __d__0."country", __d__0."city", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__0`
          + `\nLEFT JOIN "data" T ON T."region" = __d__0."region" AND (T."country" = __d__0."country" OR __d__0."country" IS NULL) AND (T."city" = __d__0."city" OR __d__0."city" IS NULL) GROUP BY __d__0."region", __d__0."country", __d__0."city" ORDER BY MIN(__d__0."__sord__0"), MIN(__d__0."__ord__0")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "North America", "Europe", "Europe"],
          ["USA", "USA", "Canada", "UK", "Germany"],
          ["New York", "Chicago", null, "London", "Berlin"],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [5100, 2540, 2180, 3350, 4030],
        ]);
      });
    });
  });

  describe("hierarchy 4-level progressive — independent subtree expansion", () => {
    const hierRCCD = hierarchy("region", "country", "city", "department");

    describe("base state — region only", () => {
      const config: PivotConfig = {
        rows: { expr: hierRCCD, projection: [] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"hierarchy","fields":["region","country","city","department"],"filter":[],"segments":[{"groupBy":["region"]}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region")`
          + `\nSELECT __d__0."region", __d__0."country", __d__0."city", __d__0."department", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__0`
          + `\nLEFT JOIN "data" T ON T."region" = __d__0."region" AND (T."country" = __d__0."country" OR __d__0."country" IS NULL) AND (T."city" = __d__0."city" OR __d__0."city" IS NULL) AND (T."department" = __d__0."department" OR __d__0."department" IS NULL)`
          + ` GROUP BY __d__0."region", __d__0."country", __d__0."city", __d__0."department"`
          + ` ORDER BY MIN(__d__0."__ord__0")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe"],
          [null, null],
          [null, null],
          [null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 7380],
        ]);
      });
    });

    describe("open Europe — Europe countries visible, NA collapsed", () => {
      const config: PivotConfig = {
        rows: { expr: hierRCCD, projection: [{ open: ["Europe"] }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"hierarchy","fields":["region","country","city","department"],"filter":[],"segments":[{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]}]}}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     )`
          + `\nSELECT __d__0."region", __d__0."country", __d__0."city", __d__0."department", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__0`
          + `\nLEFT JOIN "data" T ON T."region" = __d__0."region" AND (T."country" = __d__0."country" OR __d__0."country" IS NULL) AND (T."city" = __d__0."city" OR __d__0."city" IS NULL) AND (T."department" = __d__0."department" OR __d__0."department" IS NULL) GROUP BY __d__0."region", __d__0."country", __d__0."city", __d__0."department" ORDER BY MIN(__d__0."__sord__0"), MIN(__d__0."__ord__0")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe"],
          [null, "UK", "Germany"],
          [null, null, null],
          [null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 3350, 4030],
        ]);
      });
    });

    describe("Europe wildcard countries — Europe cities visible", () => {
      const config: PivotConfig = {
        rows: { expr: hierRCCD, projection: [{ open: ["Europe"], next: { open: "*" } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"hierarchy","fields":["region","country","city","department"],"filter":[],"segments":[{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]}]}}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     )`
          + `\nSELECT __d__0."region", __d__0."country", __d__0."city", __d__0."department", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__0`
          + `\nLEFT JOIN "data" T ON T."region" = __d__0."region" AND (T."country" = __d__0."country" OR __d__0."country" IS NULL) AND (T."city" = __d__0."city" OR __d__0."city" IS NULL) AND (T."department" = __d__0."department" OR __d__0."department" IS NULL) GROUP BY __d__0."region", __d__0."country", __d__0."city", __d__0."department" ORDER BY MIN(__d__0."__sord__0"), MIN(__d__0."__ord__0")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe"],
          [null, "UK", "Germany"],
          [null, "London", "Berlin"],
          [null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 3350, 4030],
        ]);
      });
    });

    describe("Europe to city + NA selective USA to city — independent subtrees", () => {
      const config: PivotConfig = {
        rows: {
          expr: hierRCCD,
          projection: [
            { open: ["Europe"], next: { open: "*" } },
            { open: ["North America"], next: { open: ["USA"] } },
          ],
        },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"hierarchy","fields":["region","country","city","department"],"filter":[],"segments":[{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["North America"]},{"field":"country","values":["USA"]}],"fail":[]}},{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["North America"]}],"fail":[{"field":"country","values":["USA"]}]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe","North America"]}]}}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND "country" IN ('USA') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND NOT (COALESCE("country" IN ('USA'), FALSE)) GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe','North America'), FALSE)) GROUP BY "region"`
          + `\n     )`
          + `\nSELECT __d__0."region", __d__0."country", __d__0."city", __d__0."department", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__0`
          + `\nLEFT JOIN "data" T ON T."region" = __d__0."region" AND (T."country" = __d__0."country" OR __d__0."country" IS NULL) AND (T."city" = __d__0."city" OR __d__0."city" IS NULL) AND (T."department" = __d__0."department" OR __d__0."department" IS NULL) GROUP BY __d__0."region", __d__0."country", __d__0."city", __d__0."department" ORDER BY MIN(__d__0."__sord__0"), MIN(__d__0."__ord__0")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "North America", "Europe", "Europe"],
          ["USA", "USA", "Canada", "UK", "Germany"],
          ["New York", "Chicago", null, "London", "Berlin"],
          [null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [5100, 2540, 2180, 3350, 4030],
        ]);
      });
    });

    describe("New York to department level — deepest expansion in one subtree", () => {
      const config: PivotConfig = {
        rows: {
          expr: hierRCCD,
          projection: [
            { open: ["Europe"], next: { open: "*" } },
            { open: ["North America"], next: { open: ["USA"], next: { open: ["New York"] } } },
          ],
        },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"hierarchy","fields":["region","country","city","department"],"filter":[],"segments":[{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region","country","city","department"],"filter":{"pass":[{"field":"region","values":["North America"]},{"field":"country","values":["USA"]},{"field":"city","values":["New York"]}],"fail":[]}},{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["North America"]},{"field":"country","values":["USA"]}],"fail":[{"field":"city","values":["New York"]}]}},{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["North America"]}],"fail":[{"field":"country","values":["USA"]}]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe","North America"]}]}}]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", "city", "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND "country" IN ('USA') AND "city" IN ('New York') GROUP BY "region", "country", "city", "department"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND "country" IN ('USA') AND NOT (COALESCE("city" IN ('New York'), FALSE)) GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND NOT (COALESCE("country" IN ('USA'), FALSE)) GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", CAST(NULL AS VARCHAR) AS "department", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe','North America'), FALSE)) GROUP BY "region"`
          + `\n     )`
          + `\nSELECT __d__0."region", __d__0."country", __d__0."city", __d__0."department", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__0`
          + `\nLEFT JOIN "data" T ON T."region" = __d__0."region" AND (T."country" = __d__0."country" OR __d__0."country" IS NULL) AND (T."city" = __d__0."city" OR __d__0."city" IS NULL) AND (T."department" = __d__0."department" OR __d__0."department" IS NULL) GROUP BY __d__0."region", __d__0."country", __d__0."city", __d__0."department" ORDER BY MIN(__d__0."__sord__0"), MIN(__d__0."__ord__0")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "North America", "North America", "Europe", "Europe"],
          ["USA", "USA", "USA", "Canada", "UK", "Germany"],
          ["New York", "New York", "Chicago", null, "London", "Berlin"],
          ["Electronics", "Apparel", null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [4450, 650, 2540, 2180, 3350, 4030],
        ]);
      });
    });
  });

  describe("cross two hierarchies progressive [2-child, binary gating]", () => {
    const crossHH = cross(hierarchy("region", "country", "city"), hierarchy("department", "product"));

    describe("base state — region only, child 1 invisible", () => {
      const config: PivotConfig = {
        rows: { expr: crossHH, projection: [] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"hierarchy","fields":["region","country","city"],"filter":[],"segments":[{"groupBy":["region"]}]},{"type":"hierarchy","fields":["department","product"],"filter":[]}],"segments":[{"visibleChildren":1}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" GROUP BY "region"),`
          + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__2 AS (SELECT __d__0.*, CAST(NULL AS VARCHAR) AS "department", CAST(NULL AS VARCHAR) AS "product", 0 AS "__ord__1" FROM __d__0)`
          + `\nSELECT __d__2."region", __d__2."country", __d__2."city", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND (T."country" = __d__2."country" OR __d__2."country" IS NULL) AND (T."city" = __d__2."city" OR __d__2."city" IS NULL) AND (T."department" = __d__2."department" OR __d__2."department" IS NULL) AND (T."product" = __d__2."product" OR __d__2."product" IS NULL)`
          + ` GROUP BY __d__2."region", __d__2."country", __d__2."city", __d__2."department", __d__2."product"`
          + ` ORDER BY MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe"],
          [null, null],
          [null, null],
          [null, null],
          [null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 7380],
        ]);
      });
    });

    describe("open Europe — Europe countries visible, NA collapsed", () => {
      const config: PivotConfig = {
        rows: { expr: crossHH, projection: [{ open: ["Europe"] }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"hierarchy","fields":["region","country","city"],"filter":[],"segments":[{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]}]}}]},{"type":"hierarchy","fields":["department","product"],"filter":[]}],"segments":[{"visibleChildren":1}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__2 AS (SELECT __d__0.*, CAST(NULL AS VARCHAR) AS "department", CAST(NULL AS VARCHAR) AS "product", 0 AS "__ord__1" FROM __d__0)`
          + `\nSELECT __d__2."region", __d__2."country", __d__2."city", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND (T."country" = __d__2."country" OR __d__2."country" IS NULL) AND (T."city" = __d__2."city" OR __d__2."city" IS NULL) AND (T."department" = __d__2."department" OR __d__2."department" IS NULL) AND (T."product" = __d__2."product" OR __d__2."product" IS NULL) GROUP BY __d__2."region", __d__2."country", __d__2."city", __d__2."department", __d__2."product" ORDER BY MIN(__d__2."__sord__0"), MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe"],
          [null, "UK", "Germany"],
          [null, null, null],
          [null, null, null],
          [null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 3350, 4030],
        ]);
      });
    });

    describe("Europe/UK to city — approaching child 0 edge", () => {
      const config: PivotConfig = {
        rows: { expr: crossHH, projection: [{ open: ["Europe"], next: { open: ["UK"] } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"hierarchy","fields":["region","country","city"],"filter":[],"segments":[{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["Europe"]},{"field":"country","values":["UK"]}],"fail":[]}},{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[{"field":"country","values":["UK"]}]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]}]}}]},{"type":"hierarchy","fields":["department","product"],"filter":[]}],"segments":[{"visibleChildren":1}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND "country" IN ('UK') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND NOT (COALESCE("country" IN ('UK'), FALSE)) GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__2 AS (SELECT __d__0.*, CAST(NULL AS VARCHAR) AS "department", CAST(NULL AS VARCHAR) AS "product", 0 AS "__ord__1" FROM __d__0)`
          + `\nSELECT __d__2."region", __d__2."country", __d__2."city", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND (T."country" = __d__2."country" OR __d__2."country" IS NULL) AND (T."city" = __d__2."city" OR __d__2."city" IS NULL) AND (T."department" = __d__2."department" OR __d__2."department" IS NULL) AND (T."product" = __d__2."product" OR __d__2."product" IS NULL) GROUP BY __d__2."region", __d__2."country", __d__2."city", __d__2."department", __d__2."product" ORDER BY MIN(__d__2."__sord__0"), MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe"],
          [null, "UK", "Germany"],
          [null, "London", null],
          [null, null, null],
          [null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 3350, 4030],
        ]);
      });
    });

    describe("Europe/UK/London — child 0 fully traversed, child 1 becomes visible", () => {
      const config: PivotConfig = {
        rows: { expr: crossHH, projection: [{ open: ["Europe"], next: { open: ["UK"], next: { open: ["London"] } } }] },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"hierarchy","fields":["region","country","city"],"filter":[],"segments":[{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["Europe"]},{"field":"country","values":["UK"]},{"field":"city","values":["London"]}],"fail":[]}},{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["Europe"]},{"field":"country","values":["UK"]}],"fail":[{"field":"city","values":["London"]}]}},{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[{"field":"country","values":["UK"]}]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]}]}}]},{"type":"hierarchy","fields":["department","product"],"filter":[],"segments":[{"groupBy":["department"]}]}],"segments":[{"visibleChildren":2,"filter":{"pass":[{"field":"region","values":["Europe"]},{"field":"country","values":["UK"]},{"field":"city","values":["London"]}],"fail":[]}},{"visibleChildren":1,"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]},{"field":"country","values":["UK"]},{"field":"city","values":["London"]}]}}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND "country" IN ('UK') AND "city" IN ('London') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND "country" IN ('UK') AND NOT (COALESCE("city" IN ('London'), FALSE)) GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND NOT (COALESCE("country" IN ('UK'), FALSE)) GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department"),`
          + `\n     __d__2 AS (`
          + `\n       SELECT __d__0."region", __d__0."country", __d__0."city", __d__1."department", __d__1."product", __d__0."__sord__0", __d__0."__ord__0", __d__1."__ord__1" FROM __d__0 CROSS JOIN __d__1 WHERE __d__0."region" IN ('Europe') AND __d__0."country" IN ('UK') AND __d__0."city" IN ('London')`
          + `\n       UNION ALL`
          + `\n       SELECT __d__0."region", __d__0."country", __d__0."city", CAST(NULL AS VARCHAR) AS "department", CAST(NULL AS VARCHAR) AS "product", __d__0."__sord__0", __d__0."__ord__0", 0 AS "__ord__1" FROM __d__0 WHERE NOT (COALESCE(__d__0."region" IN ('Europe'), FALSE) AND COALESCE(__d__0."country" IN ('UK'), FALSE) AND COALESCE(__d__0."city" IN ('London'), FALSE))`
          + `\n     )`
          + `\nSELECT __d__2."region", __d__2."country", __d__2."city", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND (T."country" = __d__2."country" OR __d__2."country" IS NULL) AND (T."city" = __d__2."city" OR __d__2."city" IS NULL) AND (T."department" = __d__2."department" OR __d__2."department" IS NULL) AND (T."product" = __d__2."product" OR __d__2."product" IS NULL) GROUP BY __d__2."region", __d__2."country", __d__2."city", __d__2."department", __d__2."product" ORDER BY MIN(__d__2."__sord__0"), MIN(__d__2."__ord__0"), MIN(__d__2."__ord__1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe", "Europe"],
          [null, "UK", "UK", "Germany"],
          [null, "London", "London", null],
          [null, "Electronics", "Apparel", null],
          [null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 2250, 1100, 4030],
        ]);
      });
    });

    describe("two paths — EU/UK/London drills into child 1, NA wildcard to city with New York gated", () => {
      const config: PivotConfig = {
        rows: {
          expr: crossHH,
          projection: [
            { open: ["Europe"], next: { open: ["UK"], next: { open: ["London"], next: { open: ["Electronics"] } } } },
            { open: ["North America"], next: { open: "*", next: { open: ["New York"] } } },
          ],
        },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"hierarchy","fields":["region","country","city"],"filter":[],"segments":[{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["Europe"]},{"field":"country","values":["UK"]},{"field":"city","values":["London"]}],"fail":[]}},{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["Europe"]},{"field":"country","values":["UK"]}],"fail":[{"field":"city","values":["London"]}]}},{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[{"field":"country","values":["UK"]}]}},{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["North America"]},{"field":"city","values":["New York"]}],"fail":[]}},{"groupBy":["region","country","city"],"filter":{"pass":[{"field":"region","values":["North America"]}],"fail":[{"field":"city","values":["New York"]}]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe","North America"]}]}}]},{"type":"hierarchy","fields":["department","product"],"filter":[],"segments":[{"groupBy":["department","product"],"filter":{"pass":[{"field":"department","values":["Electronics"]}],"fail":[]}},{"groupBy":["department"],"filter":{"pass":[],"fail":[{"field":"department","values":["Electronics"]}]}}]}],"segments":[{"visibleChildren":2,"filter":{"pass":[{"field":"region","values":["Europe","North America"]},{"field":"city","values":["London","New York"]}],"fail":[]}},{"visibleChildren":1,"filter":{"pass":[],"fail":[{"field":"region","values":["Europe","North America"]},{"field":"city","values":["London","New York"]}]}}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND "country" IN ('UK') AND "city" IN ('London') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND "country" IN ('UK') AND NOT (COALESCE("city" IN ('London'), FALSE)) GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND NOT (COALESCE("country" IN ('UK'), FALSE)) GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND "city" IN ('New York') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('North America') AND NOT (COALESCE("city" IN ('New York'), FALSE)) GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe','North America'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Electronics') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Electronics'), FALSE)) GROUP BY "department"`
          + `\n     ),`
          + `\n     __d__2 AS (`
          + `\n       SELECT __d__0."region", __d__0."country", __d__0."city", __d__1."department", __d__1."product", __d__0."__sord__0", __d__0."__ord__0", __d__1."__sord__1", __d__1."__ord__1" FROM __d__0 CROSS JOIN __d__1 WHERE __d__0."region" IN ('Europe','North America') AND __d__0."city" IN ('London','New York')`
          + `\n       UNION ALL`
          + `\n       SELECT __d__0."region", __d__0."country", __d__0."city", CAST(NULL AS VARCHAR) AS "department", CAST(NULL AS VARCHAR) AS "product", __d__0."__sord__0", __d__0."__ord__0", 0 AS "__sord__1", 0 AS "__ord__1" FROM __d__0 WHERE NOT (COALESCE(__d__0."region" IN ('Europe','North America'), FALSE) AND COALESCE(__d__0."city" IN ('London','New York'), FALSE))`
          + `\n     )`
          + `\nSELECT __d__2."region", __d__2."country", __d__2."city", __d__2."department", __d__2."product", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__2`
          + `\nLEFT JOIN "data" T ON T."region" = __d__2."region" AND (T."country" = __d__2."country" OR __d__2."country" IS NULL) AND (T."city" = __d__2."city" OR __d__2."city" IS NULL) AND (T."department" = __d__2."department" OR __d__2."department" IS NULL) AND (T."product" = __d__2."product" OR __d__2."product" IS NULL) GROUP BY __d__2."region", __d__2."country", __d__2."city", __d__2."department", __d__2."product" ORDER BY MIN(__d__2."__sord__0"), MIN(__d__2."__ord__0"), MIN(__d__2."__sord__1"), MIN(__d__2."__ord__1")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "North America", "North America", "North America", "Europe", "Europe", "Europe", "Europe"],
          ["USA", "USA", "USA", "USA", "Canada", "UK", "UK", "UK", "Germany"],
          ["New York", "New York", "New York", "Chicago", "Toronto", "London", "London", "London", null],
          ["Electronics", "Electronics", "Apparel", null, null, "Electronics", "Electronics", "Apparel", null],
          ["Laptop", "Phone", null, null, null, "Laptop", "Phone", null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [2700, 1750, 650, 2540, 2180, 1400, 850, 1100, 4030],
        ]);
      });
    });
  });

  describe("cross three children progressive [3-child, 3-tier gating]", () => {
    describe("full drilldown EU/UK -> Electronics/Laptop -> Online — all 3 tiers visible", () => {
      const crossHHH = cross(hierarchy("region", "country"), hierarchy("department", "product"), "channel");
      const config: PivotConfig = {
        rows: {
          expr: crossHHH,
          projection: [
            { open: ["Europe"], next: { open: ["UK"], next: { open: ["Electronics"], next: { open: ["Laptop"], next: { open: ["Online"] } } } } },
          ],
        },
        columns: "revenue",
      };

      it("config -> projected IR", async () => {
        const model = await makeModel();
        const { merged } = model.getIR(config);

        expect(JSON.stringify(merged)).to.equal(
          '{"dimSpec":{"type":"cross","children":[{"type":"hierarchy","fields":["region","country"],"filter":[],"segments":[{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["Europe"]},{"field":"country","values":["UK"]}],"fail":[]}},{"groupBy":["region","country"],"filter":{"pass":[{"field":"region","values":["Europe"]}],"fail":[{"field":"country","values":["UK"]}]}},{"groupBy":["region"],"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]}]}}]},{"type":"hierarchy","fields":["department","product"],"filter":[],"segments":[{"groupBy":["department","product"],"filter":{"pass":[{"field":"department","values":["Electronics"]},{"field":"product","values":["Laptop"]}],"fail":[]}},{"groupBy":["department","product"],"filter":{"pass":[{"field":"department","values":["Electronics"]}],"fail":[{"field":"product","values":["Laptop"]}]}},{"groupBy":["department"],"filter":{"pass":[],"fail":[{"field":"department","values":["Electronics"]}]}}]},{"type":"simple","field":"channel","filter":[]}],"segments":[{"visibleChildren":3,"filter":{"pass":[{"field":"region","values":["Europe"]},{"field":"country","values":["UK"]},{"field":"department","values":["Electronics"]},{"field":"product","values":["Laptop"]}],"fail":[]}},{"visibleChildren":2,"filter":{"pass":[{"field":"region","values":["Europe"]},{"field":"country","values":["UK"]}],"fail":[{"field":"department","values":["Electronics"]},{"field":"product","values":["Laptop"]}]}},{"visibleChildren":1,"filter":{"pass":[],"fail":[{"field":"region","values":["Europe"]},{"field":"country","values":["UK"]}]}}],"filter":[]},"measures":[{"field":"revenue","aggregation":"sum","filter":[]}]}'
        );
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModel(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND "country" IN ('UK') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE "region" IN ('Europe') AND NOT (COALESCE("country" IN ('UK'), FALSE)) GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", MIN(rowid) AS "__ord__0", MIN(MIN(rowid)) OVER (PARTITION BY "region") AS "__sord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Electronics') AND "product" IN ('Laptop') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE "department" IN ('Electronics') AND NOT (COALESCE("product" IN ('Laptop'), FALSE)) GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1", MIN(MIN(rowid)) OVER (PARTITION BY "department") AS "__sord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Electronics'), FALSE)) GROUP BY "department"`
          + `\n     ),`
          + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
          + `\n     __d__3 AS (`
          + `\n       SELECT __d__0."region", __d__0."country", __d__1."department", __d__1."product", __d__2."channel", __d__0."__sord__0", __d__0."__ord__0", __d__1."__sord__1", __d__1."__ord__1", __d__2."__ord__2" FROM __d__0 CROSS JOIN __d__1 CROSS JOIN __d__2 WHERE __d__0."region" IN ('Europe') AND __d__0."country" IN ('UK') AND __d__1."department" IN ('Electronics') AND __d__1."product" IN ('Laptop')`
          + `\n       UNION ALL`
          + `\n       SELECT __d__0."region", __d__0."country", __d__1."department", __d__1."product", CAST(NULL AS VARCHAR) AS "channel", __d__0."__sord__0", __d__0."__ord__0", __d__1."__sord__1", __d__1."__ord__1", 0 AS "__ord__2" FROM __d__0 CROSS JOIN __d__1 WHERE __d__0."region" IN ('Europe') AND __d__0."country" IN ('UK') AND NOT (COALESCE(__d__1."department" IN ('Electronics'), FALSE) AND COALESCE(__d__1."product" IN ('Laptop'), FALSE))`
          + `\n       UNION ALL`
          + `\n       SELECT __d__0."region", __d__0."country", CAST(NULL AS VARCHAR) AS "department", CAST(NULL AS VARCHAR) AS "product", CAST(NULL AS VARCHAR) AS "channel", __d__0."__sord__0", __d__0."__ord__0", 0 AS "__sord__1", 0 AS "__ord__1", 0 AS "__ord__2" FROM __d__0 WHERE NOT (COALESCE(__d__0."region" IN ('Europe'), FALSE) AND COALESCE(__d__0."country" IN ('UK'), FALSE))`
          + `\n     )`
          + `\nSELECT __d__3."region", __d__3."country", __d__3."department", __d__3."product", __d__3."channel", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__3`
          + `\nLEFT JOIN "data" T ON T."region" = __d__3."region" AND (T."country" = __d__3."country" OR __d__3."country" IS NULL) AND (T."department" = __d__3."department" OR __d__3."department" IS NULL) AND (T."product" = __d__3."product" OR __d__3."product" IS NULL) AND (T."channel" = __d__3."channel" OR __d__3."channel" IS NULL) GROUP BY __d__3."region", __d__3."country", __d__3."department", __d__3."product", __d__3."channel" ORDER BY MIN(__d__3."__sord__0"), MIN(__d__3."__ord__0"), MIN(__d__3."__sord__1"), MIN(__d__3."__ord__1"), MIN(__d__3."__ord__2")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModel(config);

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe", "Europe", "Europe", "Europe", "Europe"],
          [null, "UK", "UK", "UK", "UK", "UK", "Germany"],
          [null, "Electronics", "Electronics", "Electronics", "Electronics", "Apparel", null],
          [null, "Laptop", "Laptop", "Laptop", "Phone", null, null],
          [null, "Online", "Retail", "Wholesale", null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([
          [9820, 1400, null, null, 850, 1100, 4030],
        ]);
      });
    });
  });

  describe("hierarchy segment ordering — cycling data does not interleave", () => {
    async function makeCyclingModel() {
      const schema: Schema[] = [
        { name: "employee", displayName: "employee", type: "dimension" },
        { name: "department", displayName: "department", type: "dimension" },
        { name: "product", displayName: "product", type: "dimension" },
        { name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum" } as Schema,
      ];
      const employee   = ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank"];
      const department = ["Sales", "Engineering", "Sales", "Engineering", "Sales", "Engineering"];
      const product    = ["Widget", "Gadget", "Gadget", "Widget", "Widget", "Gadget"];
      const revenue    = [100, 200, 300, 400, 500, 600];
      const data = [employee, department, product, revenue];
      const columns = new Map<string, SqlColumnType>([
        ["employee", "VARCHAR"], ["department", "VARCHAR"], ["product", "VARCHAR"], ["revenue", "DOUBLE"],
      ]);
      const ds = DuckDBDataSource.create();
      await ds.loadData({ table: "data", columns, data });
      return new SqlPivotDataModel(schema, ds);
    }

    it("selective open Sales+Engineering groups children under parent", async () => {
      const model = await makeCyclingModel();
      const config: PivotConfig = {
        rows: "employee",
        columns: {
          expr: cross(hierarchy("department", "product"), "revenue"),
          projection: [{ open: ["Sales"] }, { open: ["Engineering"] }],
        },
      };
      const vm = await model.getViewModel(config);

      expect(vm.columnFacets[0]).to.deep.equal([
        "Sales", "Sales", "Engineering", "Engineering",
      ]);
      expect(vm.columnFacets[1]).to.deep.equal([
        "Widget", "Gadget", "Gadget", "Widget",
      ]);
    });
  });
});
