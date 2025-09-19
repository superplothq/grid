import { add, multiply } from "utils";
import { PGlite } from "@electric-sql/pglite"

export interface CalculationResult {
  sum: number;
  product: number;
  total: number;
}

export function calculateSample(x: number, y: number): CalculationResult {
  const sum = add(x, y);
  const product = multiply(x, y);
  const total = add(sum, product);

  return {
    sum,
    product,
    total
  };
}

export async function pgOps() {
  console.log("called once");
  const db = new PGlite("idb://my-pgdata");

  // Create table
  await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT,
        email TEXT
      );
    `);

  // Insert data
  await db.exec(`
      INSERT INTO users (name, email) VALUES
      ('John Doe', 'john@example.com'),
      ('Jane Smith', 'jane@example.com');
    `);

  // Query data
  const result = await db.query("SELECT * FROM users");
  console.log(result);
}

export function processNumbers(numbers: number[]): number {
  return numbers.reduce((acc, num) => add(acc, num), 0);
}
