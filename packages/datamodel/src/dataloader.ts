/**
  * TODO:
  * Use this class to load data to local storage. Ideally csvs that fits
  * in memory should be loaded to local storage by this class.
  */

import DataSource from "./datasource";
import {Col} from "./types";


export async function loadDataToLocalStorage(
  ds: DataSource,
  schema: Record<string, string>,
  // data must be in the following format
  // [[val1, val2, val3],
  //  [val1, val2, val3]]
  data: Array<Array<string | number | boolean | null | undefined>>
) {
  const result = await ds.dsAction.upstreamExists();

}
