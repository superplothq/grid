import React, {createContext, useContext, useEffect, useState} from "react";
import {DuckDBWasmDataSource, ColumnMetadata, DataSchema} from "grid/dist/index";

interface DataSourceReady {
  status: "ready";
  ds: DuckDBWasmDataSource;
  columns: ColumnMetadata[];
}

type DataSourceState =
  | {status: "loading"}
  | DataSourceReady
  | {status: "error"; error: string};

const DataSourceContext = createContext<DataSourceState>({status: "loading"});

export const useDataSource = (): DataSourceState => useContext(DataSourceContext);

const DATA_URL = "http://localhost:8912/Citywide_Payroll_Data_20260306_FY2025_no_fiscalyear_midinit.csv";
// const DATA_URL = "http://192.168.1.4:8912/Citywide_Payroll_Data_20260306_FY2025_no_fiscalyear_midinit.csv";

const CLEAN_SCHEMA: DataSchema[] = [
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
const NUMERIC_COLUMNS = ["Regular Hours", "OT Hours"];

function buildReplaceMap(): Map<string, Map<string, string>> {
  const replace = new Map<string, Map<string, string>>();
  const moneyReplace = new Map([["$", ""], [",", ""]]);
  for (const col of MONEY_COLUMNS) {
    replace.set(col, moneyReplace);
  }
  const commaReplace = new Map([[ ",", ""]]);
  for (const col of NUMERIC_COLUMNS) {
    replace.set(col, commaReplace);
  }
  return replace;
}

function slicePreprocess(data: unknown): unknown {
  const slicedData: any[] = [];
  let i = 0;
  while (i < 50) {
    slicedData.push((data as unknown[])[i*500]);
    i++;
  }
  return slicedData;
}

export type DataSourceMode = "raw" | "clean";

export const DataSourceProvider: React.FC<{children: React.ReactNode; mode?: DataSourceMode}> = ({children, mode = "raw"}) => {
  const [state, setState] = useState<DataSourceState>({status: "loading"});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ds = await DuckDBWasmDataSource.create();
      const columns = await ds.loadDataFromURL({
        url: DATA_URL,
        type: "csv",
        preprocess: slicePreprocess,
        ...(mode === "clean" && {schema: CLEAN_SCHEMA, replace: buildReplaceMap()}),
      });
      if (!cancelled) setState({status: "ready", ds, columns});
    })().catch((err) => {
      if (!cancelled) setState({status: "error", error: String(err)});
    });
    return () => { cancelled = true; };
  }, [mode]);

  return (
    <DataSourceContext.Provider value={state}>
      {children}
    </DataSourceContext.Provider>
  );
};
