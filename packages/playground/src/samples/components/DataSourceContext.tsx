import React, {createContext, useContext, useEffect, useState} from "react";
import {DuckDBWasmDataSource, ColumnMetadata} from "grid/dist/index";

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
// const DATA_URL = "http://192.168.0.132:8912/Citywide_Payroll_Data_20260306_FY2025_no_fiscalyear_midinit.csv";

export const DataSourceProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [state, setState] = useState<DataSourceState>({status: "loading"});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ds = await DuckDBWasmDataSource.create();
      const columns = await ds.loadDataFromURL({
        url: DATA_URL,
        type: "csv",
        preprocess: (data) => {
          const slicedData: any[] = [];
          let i = 0;
          while (i < 50) {
            slicedData.push((data as unknown[])[i*500]);
            i++;
          }
          return slicedData;
        },
      });
      if (!cancelled) setState({status: "ready", ds, columns});
    })().catch((err) => {
      if (!cancelled) setState({status: "error", error: String(err)});
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <DataSourceContext.Provider value={state}>
      {children}
    </DataSourceContext.Provider>
  );
};
