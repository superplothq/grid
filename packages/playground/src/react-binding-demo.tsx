import React, {useEffect, useState} from "react";
import "grid/dist/grid.css";
import {DuckDBWasmDataSource, DataSchema, ColumnMetadata} from "grid/dist/index";
import type {SqlDataSource} from "grid/dist/index";
import type {GetRowsIR, FlatTableConfig} from "grid/dist/index";
import {
  DataGrid,
  useFlatGrid,
  type CellProps,
  type ColumnDef,
} from "frameworks/dist/react";

const CurrencyCell: React.FC<CellProps<number>> = ({value}) => {
  if (value == null) return <span>—</span>;
  const formatted = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format(value);
  return (
    <div style={{display: "flex", alignItems: "center", justifyContent: 'space-between', height: "calc(100% - 2px)", width: "100%"}}>
      <span style={{
        padding: "0 4px",
        display: "flex",
        height: "100%",
        alignItems: "center",
        background: "#2196F3",
        color: "white",
        margin: "1px"
      }}>$</span>
      <span style={{fontVariantNumeric: "tabular-nums", padding: "0 8px ", color:
        value > 0 ? "#2196F3" : "#E91E63" }}>{value}</span>
    </div>
  );
};

const DATA_URL = "http://localhost:8912/Citywide_Payroll_Data_20260306_FY2025_no_fiscalyear_midinit.csv";

const SCHEMA: DataSchema[] = [
  {name: "Payroll Number", type: "dimension"},
  {name: "Agency Name", type: "dimension"},
  {name: "Last Name", type: "dimension"},
  {name: "First Name", type: "dimension"},
  {name: "Agency Start Date", type: "dimension", subtype: "temporal", datetimeFormat: "%m/%d/%Y"},
  {name: "Work Location Borough", type: "dimension"},
  {name: "Title Description", type: "dimension"},
  {name: "Leave Status as of June 30", type: "dimension"},
  {name: "Base Salary", type: "measure", subtype: "decimal"},
  {name: "Pay Basis", type: "dimension"},
  {name: "Regular Hours", type: "measure", subtype: "decimal"},
  {name: "Regular Gross Paid", type: "measure", subtype: "decimal"},
  {name: "OT Hours", type: "measure", subtype: "decimal"},
  {name: "Total OT Paid", type: "measure", subtype: "decimal"},
  {name: "Total Other Pay", type: "measure", subtype: "decimal"},
];

const MONEY_COLUMNS = ["Base Salary", "Regular Gross Paid", "Total OT Paid", "Total Other Pay"];

function buildReplaceMap(): Map<string, Map<string, string>> {
  const replace = new Map<string, Map<string, string>>();
  const moneyReplace = new Map([["$", ""], [",", ""]]);
  for (const col of MONEY_COLUMNS) replace.set(col, moneyReplace);
  const commaReplace = new Map([[",", ""]]);
  replace.set("Regular Hours", commaReplace);
  replace.set("OT Hours", commaReplace);
  return replace;
}

function slicePreprocess(data: unknown): unknown {
  const slicedData: any[] = [];
  let i = 0;
  while (i < 50) {
    slicedData.push((data as unknown[])[i * 500]);
    i++;
  }
  return slicedData;
}

const FLAT_CONFIG: FlatTableConfig = {schema: SCHEMA, pageSize: 100};

const COLUMNS: ColumnDef[] = SCHEMA.map((s) => {
  if (MONEY_COLUMNS.includes(s.name)) {
    return {renderer: CurrencyCell};
  }
  return {};
});

const IR: GetRowsIR = {
  startRow: 0,
  endRow: 100,
  select: [],
  groupBy: [],
  project: SCHEMA.map(s => s.name),
  sort: [],
  filter: [],
};

interface FlatTableProps {
  dataSource: SqlDataSource;
  schema: DataSchema[];
}

const FlatTableWithBinding: React.FC<FlatTableProps> = ({dataSource, schema}) => {
  const {viewModel, loading, error, fetchPage, onCellRelease} = useFlatGrid({
    dataSource,
    schema,
    config: FLAT_CONFIG,
    ir: IR,
    columns: COLUMNS,
    facetDefs: {row: [{text: ""}], col: [{text: "", facetField: "colName"}], axis: "col"},
  });

  if (loading) return <p>Loading data...</p>;
  if (error) return <p style={{color: "red"}}>Error: {error.message}</p>;

  return (
    <div style={{
      height: "calc(100vh - 250px)",
      width: "calc(100vw - 200px)",
      border: "1px solid #eaeaea",
      background: "white",
    }}>
      <DataGrid
        data={viewModel}
        layout="flat"
        onCellRelease={onCellRelease}
        onViewDataEmpty={({startRow, endRow}) => fetchPage(startRow, endRow)}
      />
    </div>
  );
};

const ReactBindingDemo: React.FC = () => {
  const [dsState, setDsState] = useState<
    | {status: "loading"}
    | {status: "ready"; ds: SqlDataSource; columns: ColumnMetadata[]; schema: DataSchema[]}
    | {status: "error"; error: string}
  >({status: "loading"});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ds = await DuckDBWasmDataSource.create();
      const columns = await ds.loadDataFromURL({
        url: DATA_URL,
        type: "csv",
        preprocess: slicePreprocess,
        schema: SCHEMA,
        replace: buildReplaceMap(),
      });
      const schema = columns.map(c => ({name: c.normColName, type: c.type, subtype: c.subtype} as DataSchema));
      if (!cancelled) setDsState({status: "ready", ds, columns, schema});
    })().catch((err) => {
      if (!cancelled) setDsState({status: "error", error: String(err)});
    });
    return () => { cancelled = true; };
  }, []);

  if (dsState.status === "loading") return <p>Initializing DuckDB WASM...</p>;
  if (dsState.status === "error") return <p style={{color: "red"}}>Error: {dsState.error}</p>;

  return (
    <>
      <h2>React Binding Demo</h2>
      <p>Flat table using React binding layer. Currency columns use React cell renderer.</p>
      <FlatTableWithBinding dataSource={dsState.ds} schema={dsState.schema} />
    </>
  );
};

export default ReactBindingDemo;
