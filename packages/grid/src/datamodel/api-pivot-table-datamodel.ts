import { PivotTableDataModel } from "./pivot-table-datamodel";
import { HttpApiDataSource } from "./http-api-datasource";
import { DataSchema, ApiPivotTableConfig, PivotDataFetchAndTransformIR, PivotRawDataFromSource, PivotFilterQuery, GetPivotDataApiResponse, StandardApiCommand, StandardApiTransformResult, StandardApiTransform, StandardApiTransformContext, PivotMetadataPlumber } from "./types";

/**
 * A transform exists because the two ends of the API path are fixed independently of each other. The data source
 * returns exactly what the server sent, and no two servers agree on a response shape; the datamodel and everything
 * below it (facet extraction, viewmodel, renderer) only ever consume the internal column-major types. Nothing else
 * in the pipeline knows the server's shape, so the transform is where the two are reconciled - and since a server's
 * natural response is row-major (rows keyed by field name), a conversion is always needed, not only for a deviating
 * server.
 *
 * This is the default [`StandardApiTransform`](/docs/api-references/type-references#standardapitransform) of
 * [`ApiPivotTableDataModel`](/docs/datamodel/api-pivot-table-datamodel). It expects the standard row-major wire
 * responses: converts a `getPivotData` [`GetPivotDataApiResponse`](/docs/api-references/type-references#getpivotdataapiresponse)
 * to the column-major [`PivotRawDataFromSource`](/docs/api-references/type-references#pivotrawdatafromsource) by
 * picking the columns from the rows by name (dimension values are stringified, measure values kept as-is); every
 * other response is used as-is. A custom transform for a deviating server typically adapts the body and delegates here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defaultPivotApiTransform<C extends StandardApiCommand>(cmd: C, raw: any, ctx: StandardApiTransformContext): StandardApiTransformResult<C> {
  const std = cmd as StandardApiCommand;
  if (std.kind === "getPivotData") {
    const res = raw as GetPivotDataApiResponse;
    const measureFields = new Set(std.ir.measures.map((m) => m.field));
    const data = res.columns.map((col) => measureFields.has(col)
      ? res.rows.map((r) => r[col])
      : res.rows.map((r) => (r[col] == null ? null : String(r[col]))));
    return { columns: res.columns, data, ...(res.metadata && { metadata: res.metadata }) } as StandardApiTransformResult<C>;
  }
  return raw;
}

/**
 * A client-side wrapper over [`PivotTableDataModel`](/docs/datamodel/pivot-table-datamodel) that structures and
 * forwards its requests to servers over HTTP. It builds no query of its own: the base class decides what to fetch
 * next and expresses it as a
 * [`PivotDataFetchAndTransformIR`](/docs/api-references/type-references#pivotdatafetchandtransformir), this class
 * labels it as a command (`getPivotData`, `getFacetValues`) and hands it to the data source, and the answer comes
 * back through the transform before the base class sees it. Where that data actually comes from is the data
 * source's business, and what shape it arrives in is the transform's.
 *
 * That makes the two a pair chosen together: the data source returns the server's answer untouched, and the
 * transform changes its format into what the datamodel consumes - by default row-major
 * [`GetPivotDataApiResponse`](/docs/api-references/type-references#getpivotdataapiresponse) into column-major
 * [`PivotRawDataFromSource`](/docs/api-references/type-references#pivotrawdatafromsource), picking columns from the
 * rows by name. `executeCommand` is the one place both steps happen, so subclass overrides that issue their own
 * commands get the same treatment for free.
 *
 * @typeParam TMetadataCommand - User-defined command kinds understood by the data source, beyond the standard ones. Defaults to `never`.
 * @typeParam TMetadataResponse - The responses for `TMetadataCommand` kinds. Defaults to `never`.
 */
export class ApiPivotTableDataModel<TMetadataCommand = never, TMetadataResponse = never> extends PivotTableDataModel {
  /**
   * Resolved configuration after merging user-provided values with defaults. See
   * [`ApiPivotTableConfig`](/docs/api-references/type-references#apipivottableconfig).
   */
  config: ApiPivotTableConfig<TMetadataCommand, TMetadataResponse>;
  protected dataSource: HttpApiDataSource<TMetadataCommand, TMetadataResponse>;

  constructor(
    dataSchema: DataSchema[],
    dataSource: HttpApiDataSource<TMetadataCommand, TMetadataResponse>,
    config: ApiPivotTableConfig<TMetadataCommand, TMetadataResponse> = {},
    metadataPlumber?: PivotMetadataPlumber,
  ) {
    super(dataSchema, metadataPlumber);
    this.dataSource = dataSource;
    this.config = {
      transform: defaultPivotApiTransform as StandardApiTransform<TMetadataCommand, TMetadataResponse>,
      ...config
    };
  }

  /**
   * Execute a command through the data source and run the response through the transform. The single funnel for
   * every API call the datamodel makes - subclass overrides go through it too, so a server adaptation written once
   * in the transform applies everywhere.
   */
  protected async executeCommand<C extends StandardApiCommand<TMetadataCommand>>(cmd: C): Promise<StandardApiTransformResult<C, TMetadataResponse>> {
    const raw = await this.dataSource.execute(cmd);
    const ir = (cmd as { ir?: PivotDataFetchAndTransformIR }).ir;
    return this.config.transform!(cmd, raw, { ir, ...this.schemaInfo });
  }

  // The base class passes a metadata resolver as second argument; it is deliberately ignored here.
  // The resolver's job is to contribute fragments to a client-built query (e.g. SQL select
  // expressions in SqlPivotTableDataModel), but in the API path there is no client-built query -
  // the server decides what metadata to compute from ir.metadata, which travels inside the wire
  // request, and returns it in the response aligned with rows. The reshaper still runs on that
  // response in the base class.
  async getData(ir: PivotDataFetchAndTransformIR): Promise<PivotRawDataFromSource> {
    return await this.executeCommand({ kind: "getPivotData" as const, ir });
  }

  async resolveFacetValues(query: PivotFilterQuery): Promise<string[][]> {
    return await this.executeCommand({ kind: "getFacetValues" as const, query });
  }
}
