import React, { createContext, useContext, useEffect, useState } from "react";
import { DuckDBWasmDataSource, ColumnMetadata, DataSchema } from "grid";

interface DataSourceReady {
  status: "ready";
  ds: DuckDBWasmDataSource;
  columns: ColumnMetadata[];
}

type DataSourceState =
  | { status: "loading" }
  | DataSourceReady
  | { status: "error"; error: string };

const DataSourceContext = createContext<DataSourceState>({ status: "loading" });

export const useDataSource = (): DataSourceState => useContext(DataSourceContext);

const DATA_URL = "/Citywide_Payroll_Data_FY2025_filtered.csv";

const CLEAN_SCHEMA: DataSchema[] = [
  { name: "Payroll Number", type: "dimension" },
  { name: "Agency Name", type: "dimension" },
  { name: "Last Name", type: "dimension" },
  { name: "First Name", type: "dimension" },
  { name: "Agency Start Date", type: "dimension", subtype: "temporal", datetimeFormat: "%m/%d/%Y" },
  { name: "Work Location Borough", type: "dimension" },
  { name: "Title Description", type: "dimension" },
  { name: "Leave Status as of June 30", type: "dimension" },
  { name: "Base Salary", type: "measure", subtype: "decimal", aggregateFn: "avg" },
  { name: "Pay Basis", type: "dimension" },
  { name: "Regular Hours", type: "measure", subtype: "decimal", aggregateFn: "avg" },
  { name: "Regular Gross Paid", type: "measure", subtype: "decimal", aggregateFn: "avg" },
  { name: "OT Hours", type: "measure", subtype: "decimal", aggregateFn: "avg" },
  { name: "Total OT Paid", type: "measure", subtype: "decimal", aggregateFn: "sum" },
  { name: "Total Other Pay", type: "measure", subtype: "decimal", aggregateFn: "sum" },
];

const MONEY_COLUMNS = ["Base Salary", "Regular Gross Paid", "Total OT Paid", "Total Other Pay"];
const NUMERIC_COLUMNS = ["Regular Hours", "OT Hours"];

function buildReplaceMap(): Map<string, Map<string, string>> {
  const replace = new Map<string, Map<string, string>>();
  const moneyReplace = new Map([["$", ""], [",", ""]]);
  for (const col of MONEY_COLUMNS) {
    replace.set(col, moneyReplace);
  }
  const commaReplace = new Map([[",", ""]]);
  for (const col of NUMERIC_COLUMNS) {
    replace.set(col, commaReplace);
  }
  replace.set("Agency Name", new Map([["''", ""]]));
  return replace;
}

export const DataSourceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DataSourceState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ds = await DuckDBWasmDataSource.create();
      const columns = await ds.loadDataFromURL({
        url: DATA_URL,
        type: "csv",
        schema: CLEAN_SCHEMA,
        replace: buildReplaceMap(),
      });
      await ds.execute(
        `DELETE FROM "${ds.table}" WHERE "Work Location Borough" IS NULL OR TRIM("Work Location Borough") = ''`
      );
      if (!cancelled) setState({ status: "ready", ds, columns });
    })().catch((err) => {
      if (!cancelled) setState({ status: "error", error: String(err) });
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <DataSourceContext.Provider value={state}>
      {children}
    </DataSourceContext.Provider>
  );
};
