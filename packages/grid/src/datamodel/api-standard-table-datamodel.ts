import { StandardTableDataModel } from "./standard-table-datamodel";
import { HttpApiDataSource } from "./http-api-datasource";
import { computeOutputColumns, toColumnMajor } from "./utils";
import { DataSchema, ColumnRangeValues, ApiStandardTableConfig, StandardDataFetchAndTransformIR, GetRowsResponse, GetRowsApiResponse, StandardApiCommand, StandardApiTransformResult, StandardApiTransform, StandardApiTransformContext, StandardMetadataPlumber, StandardMetadataResolverInput } from "./types";

/**
 * A transform exists because the two ends of the API path are fixed independently of each other. The data source
 * returns exactly what the server sent, and no two servers agree on a response shape; the datamodel and everything
 * below it (page cache, flattening, viewmodel, renderer) only ever consume the internal column-major types. Nothing
 * else in the pipeline knows the server's shape, so the transform is where the two are reconciled - and since a
 * server's natural response is row-major (rows keyed by field name), a conversion is always needed, not only for a
 * deviating server.
 *
 * This is the default [`StandardApiTransform`](/docs/api-references/type-references#standardapitransform) of
 * [`ApiStandardTableDataModel`](/docs/datamodel/api-standard-table-datamodel). It expects the standard row-major wire
 * responses: converts a `getRows` [`GetRowsApiResponse`](/docs/api-references/type-references#getrowsapiresponse)
 * to the column-major [`GetRowsResponse`](/docs/api-references/type-references#getrowsresponse) by picking the
 * output columns from the rows by field name; every other response is used as-is. A custom transform for a
 * deviating server typically adapts the body and delegates here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defaultStandardApiTransform<C extends StandardApiCommand>(cmd: C, raw: any, ctx: StandardApiTransformContext): StandardApiTransformResult<C> {
  const std = cmd as StandardApiCommand;
  if (std.kind === "getRows") {
    const res = raw as GetRowsApiResponse;
    const rowData = toColumnMajor(res.rows, computeOutputColumns(std.ir, ctx));
    return { rowData, totalRowCount: res.totalRowCount, ...(res.metadata && { metadata: res.metadata }) } as StandardApiTransformResult<C>;
  }
  return raw;
}

/**
 * A client-side wrapper over [`StandardTableDataModel`](/docs/datamodel/standard-table-datamodel) that structures
 * and forwards its requests to servers over HTTP. It builds no query of its own: the base class decides what to fetch next and
 * expresses it as a [`StandardDataFetchAndTransformIR`](/docs/api-references/type-references#standarddatafetchandtransformir),
 * this class labels it as a command (`getRows`, `getRange`) and hands it to the data source, and the answer comes
 * back through the transform before the base class sees it. Where that data actually comes from is the data
 * source's business, and what shape it arrives in is the transform's.
 *
 * That makes the two a pair chosen together: the data source returns the server's answer untouched, and the
 * transform changes its format into what the datamodel consumes - by default row-major
 * [`GetRowsApiResponse`](/docs/api-references/type-references#getrowsapiresponse) into column-major
 * [`GetRowsResponse`](/docs/api-references/type-references#getrowsresponse), picking columns from the rows by field
 * name. `executeCommand` is the one place both steps happen, so subclass overrides that issue their own commands
 * (e.g. a two-call `getData`) get the same treatment for free.
 *
 * Global metadata needs no extension: the plumber passed to the constructor supplies the resolver, and
 * `buildResolverInput` hands that resolver the data source, so it issues its own command and the reshaper turns the
 * result into column metadata. Extend the class only when the resolver's raw result has to be adapted before the
 * reshaper sees it (e.g. a server that wraps every response) - override `getGlobalMetadata`, call
 * `super.getGlobalMetadata` for the fetch, and adapt what it returns.
 *
 * @typeParam TMetadataCommand - User-defined command kinds understood by the data source, beyond the standard ones. Defaults to `never`.
 * @typeParam TMetadataResponse - The responses for `TMetadataCommand` kinds. Defaults to `never`.
 */
export class ApiStandardTableDataModel<TMetadataCommand = never, TMetadataResponse = never> extends StandardTableDataModel {
  /**
   * Resolved configuration after merging user-provided values with defaults. See
   * [`ApiStandardTableConfig`](/docs/api-references/type-references#apistandardtableconfig).
   */
  declare config: ApiStandardTableConfig<TMetadataCommand, TMetadataResponse>;
  protected dataSource: HttpApiDataSource<TMetadataCommand, TMetadataResponse>;

  constructor(
    dataSchema: DataSchema[],
    dataSource: HttpApiDataSource<TMetadataCommand, TMetadataResponse>,
    config: Partial<ApiStandardTableConfig<TMetadataCommand, TMetadataResponse>> = {},
    metadataPlumber?: StandardMetadataPlumber,
  ) {
    super(dataSchema, config, metadataPlumber);
    this.dataSource = dataSource;
    this.config = {
      transform: defaultStandardApiTransform as StandardApiTransform<TMetadataCommand, TMetadataResponse>,
      ...this.config
    };
  }

  // The base rebuilds config from its own defaults, which do not carry transform.
  setConfig(config: Partial<ApiStandardTableConfig<TMetadataCommand, TMetadataResponse>>): void {
    super.setConfig({
      transform: defaultStandardApiTransform as StandardApiTransform<TMetadataCommand, TMetadataResponse>,
      ...config
    });
  }

  /**
   * Execute a command through the data source and run the response through the transform. The single funnel for
   * every API call the datamodel makes - subclass overrides (e.g. a two-call `getData`) go through it too, so a
   * server adaptation written once in the transform applies everywhere.
   */
  protected async executeCommand<C extends StandardApiCommand<TMetadataCommand>>(cmd: C): Promise<StandardApiTransformResult<C, TMetadataResponse>> {
    const raw = await this.dataSource.execute(cmd);
    const ir = (cmd as { ir?: StandardDataFetchAndTransformIR }).ir;
    return this.config.transform!(cmd, raw, { ir, ...this.schemaInfo });
  }

  protected buildResolverInput(ir: StandardDataFetchAndTransformIR): StandardMetadataResolverInput {
    return { ir, schema: this.schema, dataSource: this.dataSource };
  }

  // The base class passes a pagewise metadata resolver as second argument; it is deliberately
  // ignored here. The resolver's job is to contribute fragments to a client-built query (e.g.
  // SQL select expressions in SqlStandardTableDataModel), but in the API path there is no
  // client-built query - the server decides what metadata to compute from ir.metadata, which
  // travels inside the wire request, and returns it in the response aligned with rows. The
  // pagewise reshaper still runs on that response in the base class. For metadata that needs a
  // separate call, override getData and compose multiple executeCommand calls.
  async getData(ir: StandardDataFetchAndTransformIR): Promise<GetRowsResponse> {
    return await this.executeCommand({ kind: "getRows" as const, ir });
  }

  async getRangeOfColumn(field: string): Promise<ColumnRangeValues> {
    return await this.executeCommand({ kind: "getRange" as const, field });
  }
}
