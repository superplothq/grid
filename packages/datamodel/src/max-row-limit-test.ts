/*
 * This file contains code that is used to test the maximum number of rows that
 * can be inserted into a table in local pglite.
 * The number is around 16000000 rows for the csv data mentioned in the code for the following data.
 */

import { PGlite } from "@electric-sql/pglite"
export async function pgOps() {
  console.log("called once");
  const db = new PGlite("idb://my-pgdata2");

  // Create table
  // id SERIAL PRIMARY KEY,
  await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        name TEXT,
        email TEXT
      );
    `);


  let csvData = "";
  for (let i = 0; i < 16000000; i++) {
    // await db.exec(`
    //   INSERT INTO users (name, email) VALUES
    //   ('John Doe', 'john@example.com'),
    //   ('Jane Smith', 'jane@example.com');
    // `);

    // progressFn(i);
    csvData += "'John Doe','john@example.com'\n"
  }

  csvData = csvData.substring(0, csvData.length - 1);

  const datablob = new Blob([csvData], { type: "text/csv" });

  await db.query("COPY users FROM '/dev/blob' WITH (FORMAT csv);", [], {
    blob: datablob,
  })


  // Query data
  let t1 = performance.now();
  console.log("reading")
  const result = await db.query("SELECT count(*) FROM users");
  console.log(result);
  console.log("Time taken for SELECT count(*) (ms): ", performance.now() - t1);
}
