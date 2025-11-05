import React from "react";
import { PGlite } from "@electric-sql/pglite"

const dbname = "scratchpad2";
const Scratchpad: React.FC = () => {
  const trigger = async () => {
    console.log("#trigger");
    const db = new PGlite("idb://" + dbname);
    // const result = await db.query<{ exists: boolean }>(`
    // SELECT EXISTS (
    //     SELECT FROM pg_tables
    // );
    // `.trim());
    const result = await db.query(`
      SELECT * FROM information_schema.tables where table_name='${dbname}';
    `.trim());

    console.log("exists", result);

    // const result2 = await db.query(`
    //   SELECT
    //     column_name,
    //     data_type,
    //     is_nullable,
    //     column_default,
    //     character_maximum_length,
    //     numeric_precision,
    //     numeric_scale,
    //     ordinal_position
    //   FROM information_schema.columns
    // `.trim());
    // console.log("introspectSchema", result2);

  }

  const createTable = async () => {
    console.log("#createTable");
    const db = new PGlite("idb://" + dbname);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS ${dbname} (
        name TEXT,
        email TEXT
      );
    `);

    await db.exec(`
      INSERT INTO ${dbname} (name, email) VALUES
      ('John Doe', 'john@example.com'),
      ('Jane Smith', 'jane@example.com');
    `);


    console.log("Table created", dbname);
  }
  

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <button onClick={trigger}>Trigger </button>
      <button onClick={createTable}>Create table </button>
    </div>
  );
};

export default Scratchpad;
