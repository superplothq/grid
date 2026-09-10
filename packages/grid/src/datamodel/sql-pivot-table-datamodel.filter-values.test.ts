import { expect } from "chai";
import { PivotDataViewModel } from "../renderer/pivot-data-viewmodel";
import { DuckDBDataSource } from "./duckdb-datasource";
import { cross, hierarchy } from "./pivot-table-datamodel";
import { SqlPivotTableDataModel } from "./sql-pivot-table-datamodel";
import { DataSchema, ScalarFilter } from "./types";

describe("SQL pivot quoted filter values", () => {
  const schema: DataSchema[] = [
    { name: "author", type: "dimension" },
    { name: "category", type: "dimension" },
    { name: "revenue", type: "measure", aggregateFn: "sum" },
  ];
  let dataSource: DuckDBDataSource;
  let model: SqlPivotTableDataModel;

  beforeEach(async () => {
    dataSource = DuckDBDataSource.create();
    await dataSource.loadData({
      table: "data",
      schema,
      data: [["O'Reilly", "O'Reilly", "Zoe"], ["Editor's picks", "General", "General"], [10, 20, 30]],
    });
    model = new SqlPivotTableDataModel(schema, dataSource);
  });

  afterEach(async () => {
    await dataSource.release();
  });

  const scalarCases: { op: ScalarFilter["op"]; value: ScalarFilter["value"]; matches: "quoted" | "plain" | "none" }[] = [
    { op: "eq", value: "O'Reilly", matches: "quoted" },
    { op: "neq", value: "O'Reilly", matches: "plain" },
    { op: "in", value: ["O'Reilly"], matches: "quoted" },
    { op: "not_in", value: ["O'Reilly"], matches: "plain" },
    { op: "contains", value: "'", matches: "quoted" },
    { op: "doesNotContain", value: "'", matches: "plain" },
    { op: "startsWith", value: "O'", matches: "quoted" },
    { op: "endsWith", value: "'Reilly", matches: "quoted" },
    { op: "before", value: "O'Reilly", matches: "none" },
    { op: "after", value: "O'Reilly", matches: "plain" },
  ];

  for (const { op, value, matches } of scalarCases) {
    it(`treats apostrophes as data in scalar ${op} filters`, async () => {
      const vm = new PivotDataViewModel(await model.getViewModelData({
        rows: hierarchy("author", "category"),
        columns: "revenue",
        filter: [{ type: "scalar", field: "author", op, value }],
      }));

      expect(vm.rowFacets).to.deep.equal(matches === "quoted"
        ? [["O'Reilly", "O'Reilly"], ["Editor's picks", "General"]]
        : matches === "plain" ? [["Zoe"], ["General"]] : [[], []]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal(matches === "quoted"
        ? [[10, 20]]
        : matches === "plain" ? [[30]] : [[]]);
    });
  }

  for (const op of ["in", "not_in"] as const) {
    it(`treats apostrophes as data in tuple ${op} filters`, async () => {
      const vm = new PivotDataViewModel(await model.getViewModelData({
        rows: hierarchy("author", "category"),
        columns: "revenue",
        filter: [{ type: "tuple", fields: ["author", "category"], op, value: [["O'Reilly", "Editor's picks"]] }],
      }));

      expect(vm.rowFacets).to.deep.equal(op === "in"
        ? [["O'Reilly"], ["Editor's picks"]]
        : [["O'Reilly", "Zoe"], ["General", "General"]]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal(op === "in"
        ? [[10]]
        : [[20, 30]]);
    });
  }

  for (const mode of ["distinct", "group"] as const) {
    it(`resolves ${mode} facets using quoted filter values`, async () => {
      const values = await model.resolveFacetValues({
        type: "facet",
        fields: ["category"],
        mode,
        filters: [{ type: "scalar", field: "author", op: "eq", value: "O'Reilly" }],
      });

      expect(values).to.deep.equal([["Editor's picks", "General"]]);
    });
  }

  for (const type of ["hierarchy", "cross"] as const) {
    it(`expands quoted ${type} values and retains the collapsed remainder`, async () => {
      const vm = new PivotDataViewModel(await model.getViewModelData({
        rows: {
          expr: type === "hierarchy" ? hierarchy("author", "category") : cross(hierarchy("author"), "category"),
          projection: [{ open: ["O'Reilly"] }],
        },
        columns: "revenue",
      }));

      expect(vm.rowFacets).to.deep.equal([["O'Reilly", "O'Reilly", "Zoe"], ["Editor's picks", "General", null]]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([[10, 20, 30]]);
    });
  }
});
