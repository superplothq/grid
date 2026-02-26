/* eslint-disable quotes */
import { expect } from "chai";
import { concat, cross, hierarchy } from "./grid-datamodel";
import { makeModel, makePatchedModel } from "./datamodel.data.test";
import { AxisConfig, PivotConfig } from "./types";

describe("Dimensional Projections", () => {
  describe("rows=hierarchy(region, country, city) projection=[], columns=cross(concat(department, channel), revenue)", () => {
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
              segments: [{ groupBy: ["region"] }],
            },
            {
              type: "cross",
              children: [{
                type: "concat",
                children: [
                  { type: "simple", field: "department" },
                  { type: "simple", field: "channel" },
                ],
              }],
            },
          ],
        },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModelData(config);

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
      const vm = await model.getViewModelData({ rows: rowConfig, columns: colExpr });

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
      const vm = await model.getViewModelData(config);

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
  });

  describe("rows=hierarchy(region, country, city) projection=[{open:*,next:{open:[USA]}}], columns=cross(concat(department, channel), revenue)", () => {
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
                  { type: "simple", field: "department" },
                  { type: "simple", field: "channel" },
                ],
              }],
            },
          ],
        },
        measures: [{ field: "revenue", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModelData(config);

      expect(model.sqlStr()).to.equal(
        `WITH __d__0 AS (`
        + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "country" IN ('USA') GROUP BY "region", "country", "city"`
        + `\n       UNION ALL`
        + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE NOT (COALESCE("country" IN ('USA'), FALSE)) GROUP BY "region", "country"`
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
        + `\n  )`
        + ` GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."__c__0", __d__4."__src__0"`
        + ` ORDER BY MIN(__d__4."__ord__0"), __d__4."__src__0", MIN(__d__4."__cord__0_0")`
      );
    });

    it("config -> IR -> SQL -> data-viewmodel", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData(config);

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
    });
  });

  describe("rows=hierarchy(region, country, city), columns=cross(hierarchy(department, product), channel, revenue)", () => {
    const rowExpr = hierarchy("region", "country", "city");
    const colExpr = cross(hierarchy("department", "product"), "channel", "revenue");

    describe("rowProjection=[{open:[NA]}], colProjection=undefined", () => {
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
                segments: [
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["North America"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["North America"] }] } },
                ],
              },
              {
                type: "cross",
                children: [
                  { type: "hierarchy", fields: ["department", "product"] },
                  { type: "simple", field: "channel" },
                ],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum" }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModelData(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('North America') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('North America'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
          + `\n     __d__3 AS (SELECT * FROM __d__1 CROSS JOIN __d__2),`
          + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
          + `\nSELECT __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (T."country" = __d__4."country" OR __d__4."country" IS NULL) AND (T."city" = __d__4."city" OR __d__4."city" IS NULL) AND T."department" = __d__4."department" AND T."product" = __d__4."product" AND T."channel" = __d__4."channel"`
          + ` GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel"`
          + ` ORDER BY MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__2")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModelData(config);

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

    describe("rowProjection=[{open:[NA]},{open:[EU]}], colProjection=[{open:[Electronics],next:{open:*}}]", () => {
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
                    segments: [
                      { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Electronics"] }], fail: [] } },
                      { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Electronics"] }] } },
                    ],
                  },
                  { type: "simple", field: "channel" },
                ],
                segments: [
                  { visibleChildren: 2, filter: { pass: [{ field: "department", values: ["Electronics"] }], fail: [] } },
                  { visibleChildren: 1, filter: { pass: [], fail: [{ field: "department", values: ["Electronics"] }] } },
                ],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum" }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModelData(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('North America') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('North America','Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE "department" IN ('Electronics') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Electronics'), FALSE)) GROUP BY "department"`
          + `\n     ),`
          + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
          + `\n     __d__3 AS (`
          + `\n       SELECT __d__1."department", __d__1."product", __d__2."channel", __d__1."__ord__1", __d__2."__ord__2" FROM __d__1 CROSS JOIN __d__2 WHERE __d__1."department" IN ('Electronics')`
          + `\n       UNION ALL`
          + `\n       SELECT __d__1."department", __d__1."product", CAST(NULL AS VARCHAR) AS "channel", __d__1."__ord__1", 0 AS "__ord__2" FROM __d__1 WHERE NOT (COALESCE(__d__1."department" IN ('Electronics'), FALSE))`
          + `\n     ),`
          + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
          + `\nSELECT __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (T."country" = __d__4."country" OR __d__4."country" IS NULL) AND (T."city" = __d__4."city" OR __d__4."city" IS NULL) AND T."department" = __d__4."department" AND (T."product" = __d__4."product" OR __d__4."product" IS NULL) AND (T."channel" = __d__4."channel" OR __d__4."channel" IS NULL)`
          + ` GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel"`
          + ` ORDER BY MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__2")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModelData(config);

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

    describe("rowProjection=[{open:[NA]},{open:[EU]}], colProjection=[{open:[Electronics],next:{open:*}},{open:*}]", () => {
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
                segments: [
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["North America"] }], fail: [] } },
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["North America", "Europe"] }] } },
                ],
              },
              {
                type: "cross",
                children: [
                  { type: "hierarchy", fields: ["department", "product"] },
                  { type: "simple", field: "channel" },
                ],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum" }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModelData(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('North America') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('North America','Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" GROUP BY "department", "product"),`
          + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
          + `\n     __d__3 AS (SELECT * FROM __d__1 CROSS JOIN __d__2),`
          + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
          + `\nSELECT __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel", SUM(T."revenue") AS "revenue"`
          + `\nFROM __d__4`
          + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (T."country" = __d__4."country" OR __d__4."country" IS NULL) AND (T."city" = __d__4."city" OR __d__4."city" IS NULL) AND T."department" = __d__4."department" AND T."product" = __d__4."product" AND T."channel" = __d__4."channel"`
          + ` GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel"`
          + ` ORDER BY MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__2")`
        );
      });

      it("config -> IR -> SQL -> data-viewmodel", async () => {
        const model = await makeModel();
        const vm = await model.getViewModelData(config);

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
      });
    });

    describe("Multiple projections", () => {
      describe("rowProjection=[{open:[NA],next:{open:[USA]}},{open:[EU],next:{open:[UK]}}], colProjection=[{open:[Electronics],next:{open:[Laptop]}},{open:[Apparel],next:{open:[Jacket]}}]", () => {
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
                      segments: [
                        { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Electronics"] }, { field: "product", values: ["Laptop"] }], fail: [] } },
                        { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Electronics"] }], fail: [{ field: "product", values: ["Laptop"] }] } },
                        { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Apparel"] }, { field: "product", values: ["Jacket"] }], fail: [] } },
                        { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Apparel"] }], fail: [{ field: "product", values: ["Jacket"] }] } },
                        { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Electronics", "Apparel"] }] } },
                      ],
                    },
                    { type: "simple", field: "channel" },
                  ],
                  segments: [
                    { visibleChildren: 2, filter: { pass: [{ field: "department", values: ["Electronics", "Apparel"] }, { field: "product", values: ["Laptop", "Jacket"] }], fail: [] } },
                    { visibleChildren: 1, filter: { pass: [], fail: [{ field: "department", values: ["Electronics", "Apparel"] }, { field: "product", values: ["Laptop", "Jacket"] }] } },
                  ],
                },
              ],
            },
            measures: [{ field: "revenue", aggregation: "sum" }],
          });
        });

        it("IR -> SQL", async () => {
          const model = await makePatchedModel();
          await model.getViewModelData(config);

          expect(model.sqlStr()).to.equal(
            `WITH __d__0 AS (`
            + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('North America') AND "country" IN ('USA') GROUP BY "region", "country", "city"`
            + `\n       UNION ALL`
            + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('North America') AND NOT (COALESCE("country" IN ('USA'), FALSE)) GROUP BY "region", "country"`
            + `\n       UNION ALL`
            + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('Europe') AND "country" IN ('UK') GROUP BY "region", "country", "city"`
            + `\n       UNION ALL`
            + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('Europe') AND NOT (COALESCE("country" IN ('UK'), FALSE)) GROUP BY "region", "country"`
            + `\n       UNION ALL`
            + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('North America','Europe'), FALSE)) GROUP BY "region"`
            + `\n     ),`
            + `\n     __d__1 AS (`
            + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE "department" IN ('Electronics') AND "product" IN ('Laptop') GROUP BY "department", "product"`
            + `\n       UNION ALL`
            + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE "department" IN ('Electronics') AND NOT (COALESCE("product" IN ('Laptop'), FALSE)) GROUP BY "department", "product"`
            + `\n       UNION ALL`
            + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE "department" IN ('Apparel') AND "product" IN ('Jacket') GROUP BY "department", "product"`
            + `\n       UNION ALL`
            + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE "department" IN ('Apparel') AND NOT (COALESCE("product" IN ('Jacket'), FALSE)) GROUP BY "department", "product"`
            + `\n       UNION ALL`
            + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Electronics','Apparel'), FALSE)) GROUP BY "department"`
            + `\n     ),`
            + `\n     __d__2 AS (SELECT "channel", MIN(rowid) AS "__ord__2" FROM "data" GROUP BY "channel"),`
            + `\n     __d__3 AS (`
            + `\n       SELECT __d__1."department", __d__1."product", __d__2."channel", __d__1."__ord__1", __d__2."__ord__2" FROM __d__1 CROSS JOIN __d__2 WHERE __d__1."department" IN ('Electronics','Apparel') AND __d__1."product" IN ('Laptop','Jacket')`
            + `\n       UNION ALL`
            + `\n       SELECT __d__1."department", __d__1."product", CAST(NULL AS VARCHAR) AS "channel", __d__1."__ord__1", 0 AS "__ord__2" FROM __d__1 WHERE NOT (COALESCE(__d__1."department" IN ('Electronics','Apparel'), FALSE) AND COALESCE(__d__1."product" IN ('Laptop','Jacket'), FALSE))`
            + `\n     ),`
            + `\n     __d__4 AS (SELECT * FROM __d__0 CROSS JOIN __d__3)`
            + `\nSELECT __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel", SUM(T."revenue") AS "revenue"`
            + `\nFROM __d__4`
            + `\nLEFT JOIN "data" T ON T."region" = __d__4."region" AND (T."country" = __d__4."country" OR __d__4."country" IS NULL) AND (T."city" = __d__4."city" OR __d__4."city" IS NULL) AND T."department" = __d__4."department" AND (T."product" = __d__4."product" OR __d__4."product" IS NULL) AND (T."channel" = __d__4."channel" OR __d__4."channel" IS NULL)`
            + ` GROUP BY __d__4."region", __d__4."country", __d__4."city", __d__4."department", __d__4."product", __d__4."channel"`
            + ` ORDER BY MIN(__d__4."__ord__0"), MIN(__d__4."__ord__1"), MIN(__d__4."__ord__2")`
          );
        });

        it("config -> IR -> SQL -> data-viewmodel", async () => {
          const model = await makeModel();
          const vm = await model.getViewModelData(config);

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

  describe("rows=hierarchy(region, country) projection=[], columns=cross(hierarchy(department, product), concat(revenue, cost)) projection=[]", () => {
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
              segments: [{ groupBy: ["region"] }],
            },
            {
              type: "cross",
              children: [
                {
                  type: "hierarchy",
                  fields: ["department", "product"],
                  segments: [{ groupBy: ["department"] }],
                },
              ],
            },
          ],
        },
        measures: [{ field: "revenue", aggregation: "sum" }, { field: "cost", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModelData(config);

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
      const vm = await model.getViewModelData(config);

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
    });
  });

  describe("rows=hierarchy(region, country) projection=[{open:*}], columns=cross(hierarchy(department, product), concat(revenue, cost)) projection=[{open:*}]", () => {
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
            },
            {
              type: "cross",
              children: [
                {
                  type: "hierarchy",
                  fields: ["department", "product"],
                },
              ],
            },
          ],
        },
        measures: [{ field: "revenue", aggregation: "sum" }, { field: "cost", aggregation: "sum" }],
      });
    });

    it("IR -> SQL", async () => {
      const model = await makePatchedModel();
      await model.getViewModelData(config);

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
      const vm = await model.getViewModelData(config);

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
    });
  });

  describe("rows=concat(hierarchy(region, country, city), hierarchy(department, product))", () => {
    const concatRows = concat(hierarchy("region", "country", "city"), hierarchy("department", "product"));

    describe("projection=[]", () => {
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
                segments: [{ groupBy: ["region"] }],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                segments: [{ groupBy: ["department"] }],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum" }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModelData(config);

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
        const vm = await model.getViewModelData(config);

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

    describe("projection=[{open:*}]", () => {
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
                segments: [{ groupBy: ["region", "country"] }],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum" }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModelData(config);

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
        const vm = await model.getViewModelData(config);

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

    describe("projection=[{open:*,next:{open:*}}]", () => {
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
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum" }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModelData(config);

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
        const vm = await model.getViewModelData(config);

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

    describe("projection=[{open:[Europe]}]", () => {
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
                segments: [
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["Europe"] }] } },
                ],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                segments: [
                  { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Europe"] }] } },
                ],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum" }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModelData(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE "department" IN ('Europe') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Europe'), FALSE)) GROUP BY "department"`
          + `\n     ),`
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
        const vm = await model.getViewModelData(config);

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

    describe("projection=[{open:[Electronics]}]", () => {
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
                segments: [
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Electronics"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["Electronics"] }] } },
                ],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                segments: [
                  { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Electronics"] }], fail: [] } },
                  { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Electronics"] }] } },
                ],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum" }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModelData(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('Electronics') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Electronics'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE "department" IN ('Electronics') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Electronics'), FALSE)) GROUP BY "department"`
          + `\n     ),`
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
        const vm = await model.getViewModelData(config);

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

    describe("projection=[{open:[Europe],next:{open:*}}]", () => {
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
                segments: [
                  { groupBy: ["region", "country", "city"], filter: { pass: [{ field: "region", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["Europe"] }] } },
                ],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                segments: [
                  { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Europe"] }] } },
                ],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum" }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModelData(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country", "city"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE "department" IN ('Europe') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Europe'), FALSE)) GROUP BY "department"`
          + `\n     ),`
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
        const vm = await model.getViewModelData(config);

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

    describe("projection=[{open:[Europe]},{open:[Electronics]}]", () => {
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
                segments: [
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["region", "country"], filter: { pass: [{ field: "region", values: ["Electronics"] }], fail: [] } },
                  { groupBy: ["region"], filter: { pass: [], fail: [{ field: "region", values: ["Europe", "Electronics"] }] } },
                ],
              },
              {
                type: "hierarchy",
                fields: ["department", "product"],
                segments: [
                  { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Europe"] }], fail: [] } },
                  { groupBy: ["department", "product"], filter: { pass: [{ field: "department", values: ["Electronics"] }], fail: [] } },
                  { groupBy: ["department"], filter: { pass: [], fail: [{ field: "department", values: ["Europe", "Electronics"] }] } },
                ],
              },
            ],
          },
          measures: [{ field: "revenue", aggregation: "sum" }],
        });
      });

      it("IR -> SQL", async () => {
        const model = await makePatchedModel();
        await model.getViewModelData(config);

        expect(model.sqlStr()).to.equal(
          `WITH __d__0 AS (`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('Europe') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE "region" IN ('Electronics') GROUP BY "region", "country"`
          + `\n       UNION ALL`
          + `\n       SELECT "region", CAST(NULL AS VARCHAR) AS "country", CAST(NULL AS VARCHAR) AS "city", MIN(rowid) AS "__ord__0" FROM "data" WHERE NOT (COALESCE("region" IN ('Europe','Electronics'), FALSE)) GROUP BY "region"`
          + `\n     ),`
          + `\n     __d__1 AS (`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE "department" IN ('Europe') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE "department" IN ('Electronics') GROUP BY "department", "product"`
          + `\n       UNION ALL`
          + `\n       SELECT "department", CAST(NULL AS VARCHAR) AS "product", MIN(rowid) AS "__ord__1" FROM "data" WHERE NOT (COALESCE("department" IN ('Europe','Electronics'), FALSE)) GROUP BY "department"`
          + `\n     ),`
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
        const vm = await model.getViewModelData(config);

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
});
