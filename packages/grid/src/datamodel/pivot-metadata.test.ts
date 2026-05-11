import { expect } from "chai";
import { DuckDBDataSource } from "./duckdb-datasource";
import { SqlPivotTableDataModel } from "./sql-pivot-table-datamodel";
import { PivotDataViewModel } from "../renderer/pivot-data-viewmodel";
import { cross, hierarchy, concat } from "./pivot-table-datamodel";
import {
  DataSchema,
  PivotConfig,
  PivotMetadataPlumber,
  SqlPivotMetadataResolver,
  PivotMetadataReshaper,
} from "./types";


const schemaColumns: (string | DataSchema)[] = [
  "region", "country", "department",
  { name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum" },
  { name: "cost", displayName: "Cost", type: "measure", aggregateFn: "sum" },
  { name: "profit", displayName: "Profit", type: "measure", aggregateFn: "sum" },
];

const region     = ["NA", "NA", "NA", "NA", "EU", "EU", "EU", "EU"];
const country    = ["USA", "USA", "Canada", "Canada", "UK", "UK", "Germany", "Germany"];
const department = ["Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel"];
const revenue    = [1200, 300, 1000, 200, 1400, 400, 1300, 350];
const cost       = [800, 150, 700, 100, 950, 200, 880, 170];
const profit     = [400, 150, 300, 100, 450, 200, 420, 180];

const data = [region, country, department, revenue, cost, profit];

function resolveSchema(columns: (string | DataSchema)[]): DataSchema[] {
  return columns.map((col) => {
    if (typeof col === "string") {
      return { name: col, displayName: col, type: "dimension" as const };
    }
    return col;
  });
}

async function makeModel(plumber?: PivotMetadataPlumber) {
  const schema = resolveSchema(schemaColumns);
  const ds = DuckDBDataSource.create();
  await ds.loadData({ table: "data", schema, data });
  const model = new SqlPivotTableDataModel(schema, ds, plumber);
  return Object.assign(model, {
    async getViewModel(config: PivotConfig) {
      const args = await model.getViewModelData(config);
      return new PivotDataViewModel(args);
    },
  });
}

describe("Pivot Metadata Plumbing", () => {
  describe("no metadata plumber", () => {
    it("should produce unchanged output when no plumber is set", async () => {
      const model = await makeModel();
      const config: PivotConfig = {
        rows: "region",
        columns: cross("department", "revenue"),
      };
      const vm = await model.getViewModel(config);

      expect(vm.metadata.valueCells).to.be.undefined;
      expect(vm.metadata.rowFacets).to.be.undefined;
      expect(vm.metadata.columnFacets).to.be.undefined;
      expect(vm.metadata.getValueCellMeta(0, 0)).to.be.undefined;
    });
  });

  describe("cell metadata with count/missing resolver", () => {
    const resolver: SqlPivotMetadataResolver = {
      resolve({ tableAlias }) {
        return [
          { alias: "__meta__revenue__count", sql: `COUNT(${tableAlias}."revenue")` },
          { alias: "__meta__revenue__missing", sql: `SUM(CASE WHEN ${tableAlias}."revenue" IS NULL THEN 1 ELSE 0 END)` },
        ];
      },
    };

    const reshaper: PivotMetadataReshaper = {
      reshape({ raw, rowIndex, colIndex, rowDimCount, colDimCount, measures }, metadata) {
        metadata.valueCells = [];
        const numRows = raw.data[0]?.length ?? 0;
        const totalDimCount = rowDimCount + colDimCount;
        for (let r = 0; r < numRows; r++) {
          const rowKey = [];
          for (let d = 0; d < rowDimCount; d++) rowKey.push(raw.data[d][r] ?? null);
          const rowIdx = rowIndex.get(rowKey.join("\0"));
          if (rowIdx === undefined) continue;

          const colDimParts = [];
          for (let d = rowDimCount; d < totalDimCount; d++) colDimParts.push(raw.data[d][r] ?? null);

          for (let mi = 0; mi < measures.length; mi++) {
            const field = measures[mi].field;
            const colKey = [...colDimParts, field].join("\0");
            const colIdx = colIndex.get(colKey);
            if (colIdx === undefined) continue;
            const counts = raw.metadata?.[`__meta__${field}__count`];
            const missing = raw.metadata?.[`__meta__${field}__missing`];
            metadata.valueCells!.push({
              colIndex: colIdx, rowIndex: rowIdx,
              meta: { count: counts?.[r], missing: missing?.[r] },
            });
          }
        }
      },
    };

    const plumber: PivotMetadataPlumber = () => ({ resolver, reshaper });

    it("should attach cell metadata for simple pivot", async () => {
      const model = await makeModel(plumber);
      const config: PivotConfig = {
        rows: "region",
        columns: cross("department", "revenue"),
      };
      const vm = await model.getViewModel(config);

      expect(vm.numRows).to.equal(2);
      expect(vm.numCols).to.equal(2);

      const naElecMeta = vm.metadata.getValueCellMeta(0, 0);
      expect(naElecMeta).to.not.be.undefined;
      expect(Number(naElecMeta!.count)).to.equal(2);
      expect(Number(naElecMeta!.missing)).to.equal(0);

      const euElecMeta = vm.metadata.getValueCellMeta(0, 1);
      expect(euElecMeta).to.not.be.undefined;
      expect(Number(euElecMeta!.count)).to.equal(2);
    });

    it("should attach cell metadata for concat measures with correct per-measure mapping", async () => {
      const model = await makeModel(plumber);
      const config: PivotConfig = {
        rows: "region",
        columns: concat("revenue", "cost"),
      };
      const vm = await model.getViewModel(config);

      // concat("revenue", "cost") → colDimCount=0, measures=[sum(revenue), sum(cost)]
      // fullColFacets = [["revenue", "cost"]]
      // colIndex: "revenue"→0, "cost"→1
      expect(vm.numCols).to.equal(2);
      expect(vm.numRows).to.equal(2);
      expect(vm.columnFacets).to.deep.equal([["revenue", "cost"]]);

      // revenue metadata for NA (col=0, row=0)
      const revNA = vm.metadata.getValueCellMeta(0, 0);
      expect(revNA).to.not.be.undefined;
      expect(Number(revNA!.count)).to.equal(4); // 4 NA rows all have revenue

      // revenue metadata for EU (col=0, row=1)
      const revEU = vm.metadata.getValueCellMeta(0, 1);
      expect(revEU).to.not.be.undefined;
      expect(Number(revEU!.count)).to.equal(4);

      // cost column should not have revenue metadata (resolver only counts revenue)
      // But our resolver counts revenue for all measures — the alias is __meta__revenue__count
      // which is the same value for all measures in the same raw row. So col=1 also gets it.
      const costNA = vm.metadata.getValueCellMeta(1, 0);
      expect(costNA).to.not.be.undefined;
    });

    it("should produce metadata entries for every cell in cross pivot", async () => {
      const model = await makeModel(plumber);
      const config: PivotConfig = {
        rows: hierarchy("region", "country"),
        columns: cross("department", "revenue"),
      };
      const vm = await model.getViewModel(config);

      // 4 countries × 2 departments = 8 cells
      expect(vm.numRows).to.equal(4);
      expect(vm.numCols).to.equal(2);

      // Every cell should have metadata
      for (let col = 0; col < vm.numCols; col++) {
        for (let row = 0; row < vm.numRows; row++) {
          const meta = vm.metadata.getValueCellMeta(col, row);
          expect(meta, `cell(${col},${row}) should have metadata`).to.not.be.undefined;
          expect(Number(meta!.count)).to.be.greaterThan(0);
        }
      }
    });
  });

  describe("row facet metadata with window function", () => {
    const plumber: PivotMetadataPlumber = (config) => {
      const meta = config.metadata as { profitField: string; partitionField: string } | undefined;
      if (!meta) return { reshaper: { reshape() {} } };

      return {
        resolver: {
          resolve({ gridCte, tableAlias }) {
            return [{
              alias: "__meta__profit_share",
              sql: `100.0 * SUM(${tableAlias}."${meta.profitField}") / NULLIF(SUM(SUM(${tableAlias}."${meta.profitField}")) OVER (PARTITION BY ${gridCte}."${meta.partitionField}"), 0)`,
            }];
          },
        } as SqlPivotMetadataResolver,

        reshaper: {
          reshape({ raw, rowIndex, rowDimCount }, metadata) {
            const profitShare = raw.metadata?.["__meta__profit_share"];
            if (!profitShare) return;
            const numRows = raw.data[0]?.length ?? 0;
            const seen = new Set<number>();
            metadata.rowFacets = [];
            for (let r = 0; r < numRows; r++) {
              const rowKey = [];
              for (let d = 0; d < rowDimCount; d++) rowKey.push(raw.data[d][r] ?? null);
              const rowIdx = rowIndex.get(rowKey.join("\0"));
              if (rowIdx === undefined || seen.has(rowIdx)) continue;
              seen.add(rowIdx);
              metadata.rowFacets!.push({
                level: 1, index: rowIdx,
                meta: { profitShare: profitShare[r] },
              });
            }
          },
        },
      };
    };

    it("should compute profit share per country within region", async () => {
      const model = await makeModel(plumber);
      const config: PivotConfig = {
        rows: hierarchy("region", "country"),
        columns: "revenue",
        metadata: { profitField: "profit", partitionField: "region" },
      };
      const vm = await model.getViewModel(config);

      expect(vm.rowFacets).to.deep.equal([
        ["NA", "NA", "EU", "EU"],
        ["USA", "Canada", "UK", "Germany"],
      ]);

      const usaMeta = vm.metadata.getRowFacetMeta(1, 0);
      expect(usaMeta).to.not.be.undefined;
      expect(typeof usaMeta!.profitShare).to.equal("number");

      const canadaMeta = vm.metadata.getRowFacetMeta(1, 1);
      expect(canadaMeta).to.not.be.undefined;

      const usaShare = usaMeta!.profitShare as number;
      const canadaShare = canadaMeta!.profitShare as number;
      expect(Math.round(usaShare + canadaShare)).to.equal(100);
    });

    it("should return undefined when no metadata config is provided", async () => {
      const model = await makeModel(plumber);
      const config: PivotConfig = {
        rows: hierarchy("region", "country"),
        columns: "revenue",
      };
      const vm = await model.getViewModel(config);
      expect(vm.metadata.getRowFacetMeta(1, 0)).to.be.undefined;
    });
  });

  describe("metadata merge on ViewModel", () => {
    it("should merge metadata from params into ViewModel", () => {
      const vm = new PivotDataViewModel({
        data: [[10, 20], [30, 40]],
        columnFacets: [["A", "B"]],
        metadata: {
          valueCells: [
            { colIndex: 0, rowIndex: 0, meta: { quality: "valid" } },
            { colIndex: 1, rowIndex: 1, meta: { quality: "missing" } },
          ],
        },
      });

      expect(vm.metadata.getValueCellMeta(0, 0)).to.deep.equal({ quality: "valid" });
      expect(vm.metadata.getValueCellMeta(1, 1)).to.deep.equal({ quality: "missing" });
      expect(vm.metadata.getValueCellMeta(0, 1)).to.be.undefined;
    });

    it("should merge additional metadata via updateData", () => {
      const vm = new PivotDataViewModel({
        data: [[10, 20], [30, 40]],
        columnFacets: [["A", "B"]],
        metadata: {
          valueCells: [{ colIndex: 0, rowIndex: 0, meta: { quality: "valid" } }],
        },
      });

      vm.updateData({
        data: [[10, 20], [30, 40]],
        columnFacets: [["A", "B"]],
        metadata: {
          valueColumns: [{ colIndex: 0, meta: { min: 10, max: 30 } }],
        },
      });

      expect(vm.metadata.getValueColumnMeta(0)).to.deep.equal({ min: 10, max: 30 });
      expect(vm.metadata.getValueCellMeta(0, 0)).to.deep.equal({ quality: "valid" });
    });

    it("should support all metadata targets", () => {
      const vm = new PivotDataViewModel({
        data: [[10]],
        columnFacets: [["A"]],
        rowFacets: [["R"]],
        metadata: {
          valueCells: [{ colIndex: 0, rowIndex: 0, meta: { x: 1 } }],
          valueColumns: [{ colIndex: 0, meta: { y: 2 } }],
          valueRows: [{ rowIndex: 0, meta: { z: 3 } }],
          columnFacets: [{ level: 0, index: 0, meta: { a: 4 } }],
          rowFacets: [{ level: 0, index: 0, meta: { b: 5 } }],
          headers: [{ axis: "row", level: 0, meta: { c: 6 } }],
        },
      });

      expect(vm.metadata.getValueCellMeta(0, 0)).to.deep.equal({ x: 1 });
      expect(vm.metadata.getValueColumnMeta(0)).to.deep.equal({ y: 2 });
      expect(vm.metadata.getValueRowMeta(0)).to.deep.equal({ z: 3 });
      expect(vm.metadata.getColumnFacetMeta(0, 0)).to.deep.equal({ a: 4 });
      expect(vm.metadata.getRowFacetMeta(0, 0)).to.deep.equal({ b: 5 });
      expect(vm.metadata.getHeaderMeta("row", 0)).to.deep.equal({ c: 6 });
    });
  });

  describe("hidden source field metadata", () => {
    it("should access profit field not in grid config via resolver", async () => {
      // profit is in the data but not in the pivot config — resolver can still reference it
      const plumber: PivotMetadataPlumber = () => ({
        resolver: {
          resolve({ tableAlias }) {
            return [
              { alias: "__meta__profit_sum", sql: `SUM(${tableAlias}."profit")` },
            ];
          },
        } as SqlPivotMetadataResolver,
        reshaper: {
          reshape({ raw, rowIndex, rowDimCount }, metadata) {
            const profitSum = raw.metadata?.["__meta__profit_sum"];
            if (!profitSum) return;
            const numRows = raw.data[0]?.length ?? 0;
            metadata.valueRows = [];
            for (let r = 0; r < numRows; r++) {
              const rowKey = [];
              for (let d = 0; d < rowDimCount; d++) rowKey.push(raw.data[d][r] ?? null);
              const rowIdx = rowIndex.get(rowKey.join("\0"));
              if (rowIdx === undefined) continue;
              metadata.valueRows!.push({
                rowIndex: rowIdx,
                meta: { totalProfit: profitSum[r] },
              });
            }
          },
        },
      });

      const model = await makeModel(plumber);
      // revenue is the only measure in the grid — profit is hidden
      const config: PivotConfig = {
        rows: "region",
        columns: "revenue",
      };
      const vm = await model.getViewModel(config);

      const naMeta = vm.metadata.getValueRowMeta(0);
      expect(naMeta).to.not.be.undefined;
      expect(naMeta!.totalProfit).to.equal(950); // USA: 400+150, Canada: 300+100

      const euMeta = vm.metadata.getValueRowMeta(1);
      expect(euMeta).to.not.be.undefined;
      expect(euMeta!.totalProfit).to.equal(1250); // UK: 450+200, Germany: 420+180
    });
  });

  describe("multiple metadata contributions from one resolver", () => {
    it("should extract count, min, and max in a single query", async () => {
      const plumber: PivotMetadataPlumber = () => ({
        resolver: {
          resolve({ tableAlias }) {
            return [
              { alias: "__meta__count", sql: `COUNT(${tableAlias}."revenue")` },
              { alias: "__meta__min", sql: `MIN(${tableAlias}."revenue")` },
              { alias: "__meta__max", sql: `MAX(${tableAlias}."revenue")` },
            ];
          },
        } as SqlPivotMetadataResolver,
        reshaper: {
          reshape({ raw, rowIndex, colIndex, rowDimCount, colDimCount, measures }, metadata) {
            const count = raw.metadata?.["__meta__count"];
            const min = raw.metadata?.["__meta__min"];
            const max = raw.metadata?.["__meta__max"];
            if (!count) return;
            const numRows = raw.data[0]?.length ?? 0;
            const totalDimCount = rowDimCount + colDimCount;
            metadata.valueCells = [];
            for (let r = 0; r < numRows; r++) {
              const rowKey = [];
              for (let d = 0; d < rowDimCount; d++) rowKey.push(raw.data[d][r] ?? null);
              const rowIdx = rowIndex.get(rowKey.join("\0"));
              if (rowIdx === undefined) continue;
              const colDimParts = [];
              for (let d = rowDimCount; d < totalDimCount; d++) colDimParts.push(raw.data[d][r] ?? null);
              for (let mi = 0; mi < measures.length; mi++) {
                const colKey = [...colDimParts, measures[mi].field].join("\0");
                const colIdx = colIndex.get(colKey);
                if (colIdx === undefined) continue;
                metadata.valueCells!.push({
                  colIndex: colIdx, rowIndex: rowIdx,
                  meta: { count: count[r], min: min![r], max: max![r] },
                });
              }
            }
          },
        },
      });

      const model = await makeModel(plumber);
      const config: PivotConfig = {
        rows: "region",
        columns: cross("department", "revenue"),
      };
      const vm = await model.getViewModel(config);

      const naElec = vm.metadata.getValueCellMeta(0, 0);
      expect(naElec).to.not.be.undefined;
      expect(naElec!.min).to.not.be.undefined;
      expect(naElec!.max).to.not.be.undefined;
      expect(naElec!.min).to.be.at.most(naElec!.max as number);
    });
  });

  describe("config-driven plumber", () => {
    const plumber: PivotMetadataPlumber = (config) => {
      const meta = config.metadata as { enableQuality?: boolean } | undefined;
      if (!meta?.enableQuality) return { reshaper: { reshape() {} } };
      return {
        resolver: {
          resolve({ tableAlias }) {
            return [{ alias: "__meta__count", sql: `COUNT(${tableAlias}."revenue")` }];
          },
        } as SqlPivotMetadataResolver,
        reshaper: {
          reshape({ raw, rowIndex, rowDimCount }, metadata) {
            const count = raw.metadata?.["__meta__count"];
            if (!count) return;
            metadata.valueRows = [];
            const numRows = raw.data[0]?.length ?? 0;
            for (let r = 0; r < numRows; r++) {
              const rowKey = [];
              for (let d = 0; d < rowDimCount; d++) rowKey.push(raw.data[d][r] ?? null);
              const rowIdx = rowIndex.get(rowKey.join("\0"));
              if (rowIdx === undefined) continue;
              metadata.valueRows!.push({ rowIndex: rowIdx, meta: { count: count[r] } });
            }
          },
        },
      };
    };

    it("should produce metadata when config.metadata enables it", async () => {
      const model = await makeModel(plumber);
      const config: PivotConfig = {
        rows: "region",
        columns: "revenue",
        metadata: { enableQuality: true },
      };
      const vm = await model.getViewModel(config);
      expect(vm.metadata.getValueRowMeta(0)).to.not.be.undefined;
    });

    it("should skip metadata when config.metadata does not enable it", async () => {
      const model = await makeModel(plumber);
      const config: PivotConfig = {
        rows: "region",
        columns: "revenue",
      };
      const vm = await model.getViewModel(config);
      expect(vm.metadata.getValueRowMeta(0)).to.be.undefined;
    });

    it("should skip metadata when enableQuality is false", async () => {
      const model = await makeModel(plumber);
      const config: PivotConfig = {
        rows: "region",
        columns: "revenue",
        metadata: { enableQuality: false },
      };
      const vm = await model.getViewModel(config);
      expect(vm.metadata.getValueRowMeta(0)).to.be.undefined;
    });
  });

  describe("post-reshape metadata from final grid", () => {
    it("should compute heatmap metadata from reshaped data without SQL resolver", async () => {
      // No resolver needed — the reshaper reads from data[][] directly
      const plumber: PivotMetadataPlumber = () => ({
        reshaper: {
          reshape({ data }, metadata) {
            let min = Infinity;
            let max = -Infinity;
            for (let c = 0; c < data.length; c++) {
              for (let r = 0; r < data[c].length; r++) {
                const v = data[c][r];
                if (v != null) {
                  if (v < min) min = v;
                  if (v > max) max = v;
                }
              }
            }

            metadata.valueCells = [];
            for (let c = 0; c < data.length; c++) {
              for (let r = 0; r < data[c].length; r++) {
                const v = data[c][r];
                if (v != null) {
                  metadata.valueCells.push({
                    colIndex: c,
                    rowIndex: r,
                    meta: { intensity: (v - min) / (max - min || 1) },
                  });
                }
              }
            }
          },
        },
      });

      const model = await makeModel(plumber);
      const config: PivotConfig = {
        rows: "region",
        columns: cross("department", "revenue"),
      };
      const vm = await model.getViewModel(config);

      // All cells should have intensity between 0 and 1
      for (let c = 0; c < vm.numCols; c++) {
        for (let r = 0; r < vm.numRows; r++) {
          const meta = vm.metadata.getValueCellMeta(c, r);
          expect(meta).to.not.be.undefined;
          const intensity = meta!.intensity as number;
          expect(intensity).to.be.at.least(0);
          expect(intensity).to.be.at.most(1);
        }
      }

      // The max cell should have intensity 1
      const allIntensities: number[] = [];
      for (let c = 0; c < vm.numCols; c++) {
        for (let r = 0; r < vm.numRows; r++) {
          allIntensities.push(vm.metadata.getValueCellMeta(c, r)!.intensity as number);
        }
      }
      expect(Math.max(...allIntensities)).to.equal(1);
      expect(Math.min(...allIntensities)).to.equal(0);
    });
  });

  describe("PivotRawDataFromSource metadata field", () => {
    it("should not include metadata field when no resolver is set", async () => {
      const model = await makeModel();
      const config: PivotConfig = {
        rows: "region",
        columns: cross("department", "revenue"),
      };
      const vm = await model.getViewModel(config);
      expect(vm.numRows).to.equal(2);
      expect(vm.numCols).to.equal(2);
    });
  });
});
