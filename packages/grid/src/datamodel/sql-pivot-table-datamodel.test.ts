import { expect } from "chai";
import { PivotDataViewModel } from "../renderer/pivot-data-viewmodel";
import { DuckDBDataSource } from "./duckdb-datasource";
import { cross, hierarchy } from "./pivot-table-datamodel";
import { SqlPivotTableDataModel } from "./sql-pivot-table-datamodel";
import { DataSchema, Filter, ScalarFilter } from "./types";

describe("SQL pivot empty membership filters", () => {
  const schema: DataSchema[] = [
    { name: "region", type: "dimension" },
    { name: "country", type: "dimension" },
    { name: "revenue", type: "measure", aggregateFn: "sum" },
  ];
  let dataSource: DuckDBDataSource;
  let model: SqlPivotTableDataModel;

  beforeEach(async () => {
    dataSource = DuckDBDataSource.create();
    await dataSource.loadData({
      table: "data",
      schema,
      data: [["Europe", "Europe", "Asia"], ["France", "Germany", "Japan"], [10, 20, 30]],
    });
    model = new SqlPivotTableDataModel(schema, dataSource);
  });

  afterEach(async () => {
    await dataSource.release();
  });

  for (const op of ["in", "not_in"] as const) {
    for (const type of ["scalar", "tuple"] as const) {
      it(`handles empty ${type} ${op} filters on a hierarchy`, async () => {
        const filter: Filter = type === "scalar"
          ? { type, field: "region", op, value: [] }
          : { type, fields: ["region", "country"], op, value: [] };
        const vm = new PivotDataViewModel(await model.getViewModelData({
          rows: hierarchy("region", "country"),
          columns: "revenue",
          filter: [filter],
        }));

        expect(vm.rowFacets).to.deep.equal(op === "in"
          ? [[], []]
          : [["Europe", "Europe", "Asia"], ["France", "Germany", "Japan"]]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.numRows).to.equal(op === "in" ? 0 : 3);
        expect(vm.numCols).to.equal(1);
        expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal(op === "in"
          ? [[]]
          : [[10, 20, 30]]);
      });
    }

    it(`handles an empty tuple ${op} filter spanning both axes`, async () => {
      const vm = new PivotDataViewModel(await model.getViewModelData({
        rows: "region",
        columns: cross("country", "revenue"),
        filter: [{ type: "tuple", fields: ["region", "country"], op, value: [] }],
      }));

      expect(vm.rowFacets).to.deep.equal(op === "in" ? [[]] : [["Europe", "Asia"]]);
      expect(vm.columnFacets).to.deep.equal([
        ["France", "Germany", "Japan"], ["revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal(op === "in"
        ? [[], [], []]
        : [[10, null], [20, null], [null, 30]]);
    });

    for (const mode of ["distinct", "group"] as const) {
      it(`resolves ${mode} facets with an empty ${op} filter`, async () => {
        const values = await model.resolveFacetValues({
          type: "facet",
          fields: ["region", "country"],
          mode,
          filters: [{ type: "scalar", field: "region", op, value: [] }],
        });

        expect(values).to.deep.equal(op === "in" ? [[], []] : [
          mode === "distinct" ? ["Europe", "Asia"] : ["Europe", "Europe", "Asia"],
          ["France", "Germany", "Japan"],
        ]);
      });
    }
  }

  it("keeps same-field alternatives when an inclusion list is empty", async () => {
    const filters: ScalarFilter[] = [
      { type: "scalar", field: "region", op: "in", value: [] },
      { type: "scalar", field: "region", op: "eq", value: "Europe" },
    ];
    const vm = new PivotDataViewModel(await model.getViewModelData({
      rows: hierarchy("region", "country"),
      columns: "revenue",
      filter: filters,
    }));

    expect(vm.rowFacets).to.deep.equal([["Europe", "Europe"], ["France", "Germany"]]);
    expect(vm.getSlice(0, 0, vm.numCols, vm.numRows).data).to.deep.equal([[10, 20]]);
  });
});
