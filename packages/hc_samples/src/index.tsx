import { createRoot } from "react-dom/client";
import { DataSourceProvider } from "./DataSourceProvider";
import { App } from "./App";
import "./globals.css";

const root = createRoot(document.getElementById("root")!);
root.render(
  <DataSourceProvider>
    <App />
  </DataSourceProvider>
);
