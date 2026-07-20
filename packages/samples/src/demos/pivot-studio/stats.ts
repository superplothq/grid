import type { PivotMetadataPlumber, PivotMetadataReshapeInput } from "@superplot/grid";
import type { ViewModelMetadata } from "@superplot/grid/renderer";

// Metadata plumbing that computes, per measure, the average / min / max of its
// value cells across the LEAF (non-aggregated) rows, and flags which rows are
// aggregated (collapsed-group subtotals). The reshaper derives everything from
// the already-reshaped grid - no extra SQL - and writes it into the viewmodel
// metadata so every value-cell renderer can read it back by column and row.

interface Stat {
  sum: number;
  n: number;
  min: number;
  max: number;
}

export function createStatsPlumber(): PivotMetadataPlumber {
  return () => ({
    reshaper: {
      reshape(input: PivotMetadataReshapeInput, metadata: Partial<ViewModelMetadata>): void {
        const { data, colFacets, rowFacets, measures, rowDimCount, colDimCount } = input;
        const numCols = data.length;
        const numRows = data[0]?.length ?? 0;

        // A row is an aggregated subtotal when its deepest dimension level is
        // null-padded (a collapsed parent showing a rolled-up total).
        const deepest = rowDimCount - 1;
        const aggregated: boolean[] = [];
        for (let r = 0; r < numRows; r++) {
          aggregated[r] = deepest >= 0 && rowFacets[deepest]?.[r] == null;
        }

        // Map each value column to its measure. When measures live on the column
        // axis they occupy the facet level just past the column dimensions.
        const measureFields = new Set(measures.map(m => m.field));
        const hasMeasureLevel = colFacets.length > colDimCount;
        const colMeasure: (string | null)[] = [];
        for (let c = 0; c < numCols; c++) {
          let measure: string | null = null;
          if (hasMeasureLevel) {
            const value = colFacets[colDimCount]?.[c];
            if (value != null && measureFields.has(String(value))) measure = String(value);
          }
          if (!measure && measures.length === 1) measure = measures[0].field;
          colMeasure[c] = measure;
        }

        const stats = new Map<string, Stat>();
        for (let c = 0; c < numCols; c++) {
          const measure = colMeasure[c];
          if (!measure) continue;
          let stat = stats.get(measure);
          if (!stat) {
            stat = { sum: 0, n: 0, min: Infinity, max: -Infinity };
            stats.set(measure, stat);
          }
          const column = data[c];
          for (let r = 0; r < column.length; r++) {
            if (aggregated[r]) continue;
            const raw = column[r];
            if (raw == null) continue;
            const num = Number(raw);
            if (Number.isNaN(num)) continue;
            stat.sum += num;
            stat.n++;
            if (num < stat.min) stat.min = num;
            if (num > stat.max) stat.max = num;
          }
        }

        metadata.valueColumns = [];
        for (let c = 0; c < numCols; c++) {
          const measure = colMeasure[c];
          if (!measure) continue;
          const stat = stats.get(measure);
          if (!stat || stat.n === 0) continue;
          metadata.valueColumns.push({
            colIndex: c,
            meta: { measure, avg: stat.sum / stat.n, min: stat.min, max: stat.max },
          });
        }

        metadata.valueRows = [];
        for (let r = 0; r < numRows; r++) {
          if (aggregated[r]) metadata.valueRows.push({ rowIndex: r, meta: { aggregated: true } });
        }
      },
    },
  });
}
