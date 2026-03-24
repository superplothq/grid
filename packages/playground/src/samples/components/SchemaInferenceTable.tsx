import React from "react";
import Grid from "grid/dist/renderer";
import {DataSchema} from "grid/dist/index";
import SimpleTable, {ColFacetLevel} from "./SimpleTable";
import {DataSourceProvider} from "./DataSourceContext";

const SCHEMA_FIXES: Record<string, string> = {
  "Payroll Number": "Should be dimension, not measure",
  "Agency Start Date": "Should be temporal (datetime)",
  "Base Salary": "Should be measure, not dimension",
  "Regular Hours": "Should be measure, not dimension",
  "Regular Gross Paid": "Should be measure, not dimension",
  "OT Hours": "Should be measure, not dimension",
  "Total OT Paid": "Should be measure, not dimension",
  "Total Other Pay": "Should be measure, not dimension",
};

function buildColFacetLevels(schema: DataSchema[]): ColFacetLevel[] {
  const typeLabels = schema.map((s) => {
    if (s.subtype === "temporal") return "Temporal";
    return s.type === "measure" ? "Measure" : "Dimension";
  });
  return [{ labels: typeLabels, facetField: "schemaType" }];
}

const COLORS = {
  light: { dimension: "#d6eaf8", measure: "#d4edda", temporal: "#fef9e7" },
  dark: { dimension: "#1a3a5c", measure: "#1a3c2a", temporal: "#3c3a1a" },
};

function applySchemaColors(grid: Grid, theme: string) {
  const c = theme === "dark" ? COLORS.dark : COLORS.light;

  grid.selectAll((dim, dimVal) => dim === "schemaType" && dimVal === "Dimension")
    .style((el) => { el.style.backgroundColor = c.dimension; });

  grid.selectAll((dim, dimVal) => dim === "schemaType" && dimVal === "Measure")
    .style((el) => { el.style.backgroundColor = c.measure; });

  grid.selectAll((dim, dimVal) => dim === "schemaType" && dimVal === "Temporal")
    .style((el) => { el.style.backgroundColor = c.temporal; });
}

function applySchemaWarnings(grid: Grid) {
  for (const [colName, fix] of Object.entries(SCHEMA_FIXES)) {
    grid.selectAll((dim, dimVal) => dim === "colName" && dimVal === colName)
      .prop({
        trackRenderer: (data) => {
          const warn = document.createElement("span");
          warn.textContent = "\u26A0";
          warn.title = fix;
          warn.style.cssText = "cursor:help;font-size:11px;color:#e67e22;margin-left:4px";
          return {
            content: String(data ?? ""),
            right: warn,
          };
        },
      });
  }
}

const SchemaInferenceTable: React.FC<{height?: string}> = ({height = "150px"}) => {
  const handleGridReady = (grid: Grid, _schema: DataSchema[], theme: string) => {
    applySchemaColors(grid, theme);
    applySchemaWarnings(grid);
    grid.draw();
  };

  return (
    <SimpleTable
      height={height}
      colFacetLevels={buildColFacetLevels}
      onGridReady={handleGridReady}
    />
  );
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {day: "2-digit", month: "short", year: "numeric"});

function formatTemporal(data: unknown): string {
  if (data == null) return "";
  const d = new Date(data as string);
  if (isNaN(d.getTime())) return String(data);
  return DATE_FORMAT.format(d);
}

export const CleanTable: React.FC<{height?: string}> = ({height = "500px"}) => {
  const handleGridReady = (grid: Grid, _schema: DataSchema[], theme: string) => {
    applySchemaColors(grid, theme);
    grid.selectAll((dim, dimVal) => dim === "schemaType" && dimVal === "Temporal")
      .selectAllCell(() => true)
      .prop({
        cellRenderer: (data) => formatTemporal(data),
      });
    grid.draw();
  };

  return (
    <DataSourceProvider mode="clean">
      <SimpleTable
        height={height}
        colFacetLevels={buildColFacetLevels}
        onGridReady={handleGridReady}
      />
    </DataSourceProvider>
  );
};

export default SchemaInferenceTable;
