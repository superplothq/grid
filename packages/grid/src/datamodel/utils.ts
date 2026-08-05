import { DataSchema, SchemaInfo, StandardDataFetchAndTransformIR } from "./types";

/**
 * Look up a column definition by name. Throws if the column does not exist in the schema.
 */
export function getColumn(name: string, schemaInfo: SchemaInfo): DataSchema {
  const index = schemaInfo.schemaIndex.get(name);
  const column = index === undefined ? undefined : schemaInfo.schema[index];
  if (!column) {
    throw new Error(`Column "${name}" not found in schema. Available columns: ${Array.from(schemaInfo.schemaIndex.keys()).join(", ")}`);
  }
  return column;
}

/**
 * `outputColumnsForDepth` at the IR's own depth. A request always targets one node of the group tree, and
 * `ir.groupPath` identifies that node - so its length is the depth of the page being fetched. Use this to get the
 * column order of the response for a `getRows` request; use `outputColumnsForDepth` directly when working with a
 * level other than the request's own (e.g. walking already-cached pages).
 */
export function computeOutputColumns(ir: StandardDataFetchAndTransformIR, schemaInfo: SchemaInfo): string[] {
  return outputColumnsForDepth(ir, ir.groupPath.length, schemaInfo);
}

/**
 * Since pages can be fetched lazily at different depths (expand / collapse), this function universally decides a
 * page's column order based on depth, groupBy, and project.
 *
 * At a group level (`depth < ir.groupBy.length`) the page holds aggregated group rows: the group field of that
 * level comes first (even when it is not in `project` - it labels each group row), followed by the projected
 * columns that are measures, in project order. At leaf level (`depth >= ir.groupBy.length`) the page holds
 * individual rows and the output is `project` as-is - the group context is carried by the page's position in the
 * group tree, not repeated per row.
 *
 * Example with `groupBy: ["region", "country"]` and `project: ["revenue", "units"]`:
 * - `depth = 0` (top-level groups, grouped by region): `["region", "revenue", "units"]`
 * - `depth = 1` (children of an expanded region, grouped by country): `["country", "revenue", "units"]`
 * - `depth = 2` (individual rows under an expanded country): `["revenue", "units"]`
 */
export function outputColumnsForDepth(ir: StandardDataFetchAndTransformIR, depth: number, schemaInfo: SchemaInfo): string[] {
  if (depth >= ir.groupBy.length) return ir.project;

  const groupField = ir.groupBy[depth];
  const measureCols = ir.project.filter((p) => {
    if (p === groupField) return false;
    const def = getColumn(p, schemaInfo);
    return def && def.aggregateFn;
  });
  return [groupField, ...measureCols];
}

/**
 * Reshape row-major records into a column-major layout, ordered by `columns`. Values are picked from each record
 * by field name.
 *
 * ```ts
 * toColumnMajor(
 *   [{ region: "EU", revenue: 100 }, { region: "NA", revenue: 260 }],
 *   ["region", "revenue"],
 * )
 * // => [["EU", "NA"], [100, 260]]
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toColumnMajor(rows: Record<string, any>[], columns: string[]): any[][] {
  const filtered = columns.filter((c) => c !== "__total__");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any[][] = filtered.map(() => []);
  for (const row of rows) {
    for (let i = 0; i < filtered.length; i++) {
      const val = row[filtered[i]];
      result[i].push(typeof val === "bigint" ? Number(val) : val);
    }
  }
  return result;
}
