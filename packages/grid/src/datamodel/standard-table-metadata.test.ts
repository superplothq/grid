import { expect } from "chai";
import { DuckDBDataSource } from "./duckdb-datasource";
import { SqlStandardTableDataModel } from "./sql-standard-table-datamodel";
import {
  DataSchema,
  GridData,
  StandardDataFetchAndTransformIR,
  StandardTableConfig,
  StandardMetadataPlumber,
  SqlStandardMetadataResolver,
  SqlStandardMetadataResolverInput,
  SqlSelectExpression,
  StandardMetadataResolverInput,
  StandardRawMetadata,
  StandardColumnMetadata,
  StandardPageCellMetadata,
  PageMetadata,
} from "./types";

const schemaColumns: (string | DataSchema)[] = [
  "name", "email", "city",
  { name: "age", displayName: "Age", type: "measure", aggregateFn: "sum" },
  { name: "score", displayName: "Score", type: "measure", aggregateFn: "sum" },
];

const names = ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Hank", "Ivy", "Jack", "Kate", "Leo"];
const emails = ["a@x.com", "b@x.com", null, "d@x.com", null, "f@x.com", "g@x.com", "h@x.com", "i@x.com", "j@x.com", "k@x.com", null];
const cities = ["NYC", "NYC", "LA", "LA", "SF", "SF", "NYC", "LA", "SF", "NYC", "LA", "SF"];
const ages = [25, 30, null, 40, 22, 35, 28, null, 31, 45, 27, 33];
const scores = [88, 92, 75, null, 95, 81, 90, 67, null, 85, 93, 71];

const gridData: GridData = {
  columns: schemaColumns,
  data: [names, emails, cities, ages, scores],
};

function resolveSchema(columns: (string | DataSchema)[]): DataSchema[] {
  return columns.map((col) => {
    if (typeof col === "string") return { name: col, displayName: col, type: "dimension" as const };
    return col;
  });
}

function makeIR(overrides: Partial<StandardDataFetchAndTransformIR> = {}): StandardDataFetchAndTransformIR {
  return {
    startRow: 0,
    endRow: 100,
    groupPath: [],
    groupBy: [],
    project: ["name", "email", "city", "age", "score"],
    sort: [],
    filter: [],
    ...overrides,
  };
}

function createNullCheckPlumber(): StandardMetadataPlumber {
  return (ir: StandardDataFetchAndTransformIR) => {
    const config = ir.metadata as { nullCheck: string[] } | undefined;
    const fields = config?.nullCheck ?? [];
    return {
      global: {
        resolver: {
          async resolve({ ir, dataSource }: StandardMetadataResolverInput): Promise<StandardRawMetadata> {
            const stats: Record<string, any> = {};
            for (const field of ir.project) {
              const [row] = await dataSource!.execute(
                `SELECT COUNT(*) AS total, COUNT("${field}") AS non_null FROM "${dataSource!.table}"`
              );
              stats[field] = { total: Number(row.total), nonNull: Number(row.non_null) };
            }
            return { stats };
          },
        },
        reshaper: {
          reshape({ ir, raw }): StandardColumnMetadata[] {
            const stats = (raw as { stats: Record<string, { total: number; nonNull: number }> }).stats;
            if (!stats) return [];
            return ir.project.map((field, colIdx) => ({
              colIdx,
              meta: { total: stats[field].total, missing: stats[field].total - stats[field].nonNull },
            }));
          },
        },
      },
      pageWise: {
        resolver: {
          resolve({ table: _table, ...input }: SqlStandardMetadataResolverInput): SqlSelectExpression[] {
            return fields.map(field => ({
              alias: `__meta__${field}__null`,
              sql: `CASE WHEN "${field}" IS NULL THEN 1 ELSE 0 END`,
            }));
          },
        } as SqlStandardMetadataResolver,
        reshaper: {
          reshape({ ir, pageMetadata }): PageMetadata {
            const cells: StandardPageCellMetadata[] = [];
            for (const field of fields) {
              const colIdx = ir.project.indexOf(field);
              if (colIdx === -1) continue;
              const nullFlags = pageMetadata[`__meta__${field}__null`];
              if (!nullFlags) continue;
              for (let rowIdx = 0; rowIdx < nullFlags.length; rowIdx++) {
                if (Number(nullFlags[rowIdx]) === 1) {
                  cells.push({ rowIdx, colIdx, meta: { quality: "missing" } });
                }
              }
            }
            return { cells };
          },
        },
      },
    };
  };
}

async function makeModel(config: Partial<StandardTableConfig> = {}, plumber?: StandardMetadataPlumber) {
  const schema = resolveSchema(schemaColumns);
  const ds = DuckDBDataSource.create();
  await ds.loadData({ table: "data", schema, data: gridData.data });
  const model = new SqlStandardTableDataModel(schema, ds, { pageSize: 100, maxNumPageBeforeEviction: 20, ...config }, plumber);
  return model;
}

describe("Standard Table Metadata", () => {
  describe("no plumber", () => {
    it("should return empty metadata when no plumber is set", async () => {
      const model = await makeModel();
      const params = await model.getViewModelData(makeIR());
      expect(params.metadata!.valueColumns).to.deep.equal([]);
      expect(params.metadata!.valueRows).to.deep.equal([]);
      expect(params.metadata!.valueCells).to.deep.equal([]);
    });
  });

  describe("globalResolver + globalReshaper", () => {
    it("should resolve column metadata on first call", async () => {
      const model = await makeModel({}, createNullCheckPlumber());
      const params = await model.getViewModelData(makeIR({
        metadata: { nullCheck: ["email"] },
      }));
      expect(model.columnMetadata).to.be.an("array");
      expect(model.columnMetadata!.length).to.equal(5);
      const emailMeta = model.columnMetadata!.find(c => c.colIdx === 1);
      expect(emailMeta!.meta.missing).to.equal(3);
      expect(emailMeta!.meta.total).to.equal(12);
    });

    it("should cache column metadata on subsequent calls", async () => {
      const model = await makeModel({}, createNullCheckPlumber());
      const ir = makeIR({ metadata: { nullCheck: ["email"] } });
      await model.getViewModelData(ir);
      const firstColumnMeta = model.columnMetadata;
      await model.getViewModelData(makeIR({ startRow: 0, endRow: 50, metadata: { nullCheck: ["email"] } }));
      expect(model.columnMetadata).to.equal(firstColumnMeta);
    });

    it("should reset column metadata when IR changes", async () => {
      const model = await makeModel({}, createNullCheckPlumber());
      await model.getViewModelData(makeIR({ metadata: { nullCheck: ["email"] } }));
      const firstColumnMeta = model.columnMetadata;
      await model.getViewModelData(makeIR({
        sort: [{ field: "name", direction: "asc" }],
        metadata: { nullCheck: ["email"] },
      }));
      expect(model.columnMetadata).to.not.equal(firstColumnMeta);
    });

    it("should project column metadata into valueColumns", async () => {
      const model = await makeModel({}, createNullCheckPlumber());
      const params = await model.getViewModelData(makeIR({
        metadata: { nullCheck: ["email"] },
      }));
      expect(params.metadata).to.not.be.undefined;
      expect(params.metadata!.valueColumns).to.be.an("array");
      expect(params.metadata!.valueColumns!.length).to.equal(5);
      const emailCol = params.metadata!.valueColumns!.find(c => c.colIndex === 1);
      expect(emailCol!.meta.missing).to.equal(3);
    });
  });

  describe("resolver + reshaper (per-page)", () => {
    it("should produce per-cell metadata from SQL contributions", async () => {
      const model = await makeModel({ pageSize: 6 }, createNullCheckPlumber());
      const params = await model.getViewModelData(makeIR({
        metadata: { nullCheck: ["email", "age"] },
      }));
      expect(params.metadata).to.not.be.undefined;
      expect(params.metadata!.valueCells).to.be.an("array");
      const missingEmails = params.metadata!.valueCells!.filter(c => c.colIndex === 1);
      expect(missingEmails.length).to.equal(3);
      const missingAges = params.metadata!.valueCells!.filter(c => c.colIndex === 3);
      expect(missingAges.length).to.equal(2);
    });

    it("should store page metadata on PageNode", async () => {
      const model = await makeModel({ pageSize: 6 }, createNullCheckPlumber());
      await model.getViewModelData(makeIR({
        metadata: { nullCheck: ["email"] },
      }));
      expect(model.pages[0].metadata).to.not.be.undefined;
      expect(model.pages[0].metadata!.cells).to.be.an("array");
    });

    it("should project multi-page metadata with correct offsets", async () => {
      const model = await makeModel({ pageSize: 6 }, createNullCheckPlumber());
      const params = await model.getViewModelData(makeIR({
        metadata: { nullCheck: ["email"] },
      }));
      // email nulls are at row 2 (page 0), row 4 (page 0), row 11 (page 1)
      const emailCells = params.metadata!.valueCells!.filter(c => c.colIndex === 1);
      expect(emailCells.length).to.equal(3);
      const rowIndexes = emailCells.map(c => c.rowIndex).sort((a, b) => a - b);
      expect(rowIndexes).to.deep.equal([2, 4, 11]);
    });
  });

  describe("page eviction", () => {
    it("should clear page metadata when page is evicted", async () => {
      const model = await makeModel({ pageSize: 4, maxNumPageBeforeEviction: 2 }, createNullCheckPlumber());
      await model.getViewModelData(makeIR({
        endRow: 8,
        metadata: { nullCheck: ["email"] },
      }));
      expect(model.pages[0].metadata).to.not.be.undefined;
      expect(model.pages[1].metadata).to.not.be.undefined;
      // Fetch page 2, which should evict the farthest page
      await model.getViewModelData(makeIR({
        startRow: 8,
        endRow: 12,
        metadata: { nullCheck: ["email"] },
      }));
      const evictedPages = model.pages.filter(p => p.data === null);
      for (const p of evictedPages) {
        expect(p.metadata).to.be.undefined;
      }
    });
  });

  describe("plumber always called", () => {
    it("should call plumber even when ir.metadata is absent", async () => {
      let plumberCalled = false;
      const plumber: StandardMetadataPlumber = (ir) => {
        plumberCalled = true;
        return createNullCheckPlumber()(ir);
      };
      const model = await makeModel({}, plumber);
      await model.getViewModelData(makeIR());
      expect(plumberCalled).to.be.true;
    });
  });

  describe("expand with metadata", () => {
    it("should resolve page metadata for expanded child pages", async () => {
      // Use a resolver that contributes aggregate-safe SQL (SUM of null check)
      const expandPlumber: StandardMetadataPlumber = (ir) => {
        const config = ir.metadata as { nullCheck: string[] } | undefined;
        const fields = config?.nullCheck ?? [];
        return {
          pageWise: {
            resolver: {
              resolve({ table: _table, ...input }: SqlStandardMetadataResolverInput): SqlSelectExpression[] {
                // For group-level queries, use aggregate-safe expressions
                return fields.map(field => ({
                  alias: `__meta__${field}__null_count`,
                  sql: `SUM(CASE WHEN "${field}" IS NULL THEN 1 ELSE 0 END)`,
                }));
              },
            } as SqlStandardMetadataResolver,
            reshaper: {
              reshape({ ir, pageMetadata }): PageMetadata {
                const cells: StandardPageCellMetadata[] = [];
                for (const field of fields) {
                  const colIdx = ir.project.indexOf(field);
                  if (colIdx === -1) continue;
                  const nullCounts = pageMetadata[`__meta__${field}__null_count`];
                  if (!nullCounts) continue;
                  for (let rowIdx = 0; rowIdx < nullCounts.length; rowIdx++) {
                    if (Number(nullCounts[rowIdx]) > 0) {
                      cells.push({ rowIdx, colIdx, meta: { nullCount: Number(nullCounts[rowIdx]) } });
                    }
                  }
                }
                return { cells };
              },
            },
          },
        };
      };
      const model = await makeModel({ pageSize: 100 }, expandPlumber);
      await model.getViewModelData(makeIR({
        groupBy: ["city", "name"],
        project: ["city", "name", "age", "score"],
        metadata: { nullCheck: ["age"] },
      }));
      const expandParams = await model.expand(["NYC"]);
      expect(expandParams).to.not.be.undefined;
    });
  });
});
