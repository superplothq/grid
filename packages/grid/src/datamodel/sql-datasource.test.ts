import { expect } from "chai";
import { DuckDBDataSource } from "./duckdb-datasource";
import { GridError, GridErrorCode } from "../errors";
import type { ColumnMetadata } from "./sql-datasource";
import { DataSchema } from "./types";

function stubFetch(handler: (url: string) => { status: number; body: string; ok?: boolean }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const result = handler(url);
    return {
      ok: result.ok ?? (result.status >= 200 && result.status < 300),
      status: result.status,
      json: async () => JSON.parse(result.body),
      text: async () => result.body,
    } as Response;
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

function stubFetchError() {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("Network error");
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

describe("SqlDataSource.loadDataFromURL", () => {
  let ds: DuckDBDataSource;

  beforeEach(() => {
    ds = DuckDBDataSource.create();
  });

  afterEach(async () => {
    await ds.release();
  });

  describe("JSON", () => {
    it("should load JSON data and infer column types", async () => {
      const jsonData = [
        { name: "Alice", age: 30, score: 95.5 },
        { name: "Bob", age: 25, score: 88.0 },
        { name: "Charlie", age: 35, score: 72.3 },
      ];
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect(meta).to.have.length(3);
        expect(meta.map((m: ColumnMetadata) => m.normColName)).to.deep.equal(["name", "age", "score"]);
        expect(meta[0].type).to.equal("dimension");
        expect(meta[1].type).to.equal("measure");
        expect(meta[1].subtype).to.equal("integer");
        expect(meta[2].type).to.equal("measure");
        expect(meta[2].subtype).to.equal("decimal");

        const rows = await ds.execute(`SELECT * FROM "${ds.table}" ORDER BY age`);
        expect(rows).to.have.length(3);
        expect(rows[0]).to.deep.equal({ name: "Bob", age: 25, score: 88.0 });
      } finally {
        restore();
      }
    });

    it("should respect schema order for JSON", async () => {
      const jsonData = [
        { name: "Alice", age: 30, score: 95.5 },
      ];
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const meta = await ds.loadDataFromURL({
          url: "http://test.com/data.json",
          type: "json",
          schema: [
            { name: "score", type: "measure", subtype: "decimal" },
            { name: "name", type: "dimension" },
          ],
        });
        expect(meta.map((m: ColumnMetadata) => m.normColName)).to.deep.equal(["score", "name"]);
      } finally {
        restore();
      }
    });

    it("should use Object.keys order when no columnOrder for JSON", async () => {
      const jsonData = [{ z: 1, a: 2, m: 3 }];
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect(meta.map((m: ColumnMetadata) => m.normColName)).to.deep.equal(["z", "a", "m"]);
      } finally {
        restore();
      }
    });

    it("should respect explicit schema", async () => {
      const jsonData = [
        { id: "1", value: "100" },
        { id: "2", value: "200" },
      ];
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const schema: DataSchema[] = [
          { name: "id", type: "measure", subtype: "integer" },
          { name: "value", type: "measure", subtype: "decimal" },
        ];
        const meta = await ds.loadDataFromURL({
          url: "http://test.com/data.json",
          type: "json",
          schema,
        });
        expect(meta[0].type).to.equal("measure");
        expect(meta[0].subtype).to.equal("integer");
        expect(meta[1].type).to.equal("measure");
        expect(meta[1].subtype).to.equal("decimal");

        const rows = await ds.execute(`SELECT * FROM "${ds.table}" ORDER BY id`);
        expect(rows[0].id).to.equal(1);
        expect(rows[0].value).to.equal(100);
      } finally {
        restore();
      }
    });

    it("should apply preprocess function", async () => {
      const jsonData = { results: [{ x: 1 }, { x: 2 }] };
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const meta = await ds.loadDataFromURL({
          url: "http://test.com/data.json",
          type: "json",
          preprocess: (data: unknown) => (data as { results: unknown[] }).results,
        });
        expect(meta).to.have.length(1);
        expect(meta[0].normColName).to.equal("x");

        const rows = await ds.execute(`SELECT * FROM "${ds.table}" ORDER BY x`);
        expect(rows).to.have.length(2);
      } finally {
        restore();
      }
    });
  });

  describe("CSV", () => {
    it("should load CSV data and infer column types", async () => {
      const csv = "name,age,score\nAlice,30,95.5\nBob,25,88.0\nCharlie,35,72.3";
      const restore = stubFetch(() => ({ status: 200, body: csv }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.csv", type: "csv" });
        expect(meta).to.have.length(3);
        expect(meta.map((m: ColumnMetadata) => m.normColName)).to.deep.equal(["name", "age", "score"]);
        expect(meta[0].type).to.equal("dimension");
        expect(meta[1].type).to.equal("measure");
        expect(meta[1].subtype).to.equal("integer");
        expect(meta[2].type).to.equal("measure");
        expect(meta[2].subtype).to.equal("decimal");

        const rows = await ds.execute(`SELECT * FROM "${ds.table}" ORDER BY age`);
        expect(rows).to.have.length(3);
        expect(rows[0]).to.deep.equal({ name: "Bob", age: 25, score: 88.0 });
      } finally {
        restore();
      }
    });

    it("should use CSV header order when no schema", async () => {
      const csv = "z,a,m\n1,2,3";
      const restore = stubFetch(() => ({ status: 200, body: csv }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.csv", type: "csv" });
        expect(meta.map((m: ColumnMetadata) => m.normColName)).to.deep.equal(["z", "a", "m"]);
      } finally {
        restore();
      }
    });

    it("should respect schema order for CSV", async () => {
      const csv = "name,age,score\nAlice,30,95.5";
      const restore = stubFetch(() => ({ status: 200, body: csv }));
      try {
        const meta = await ds.loadDataFromURL({
          url: "http://test.com/data.csv",
          type: "csv",
          schema: [
            { name: "score", type: "measure", subtype: "decimal" },
            { name: "name", type: "dimension" },
          ],
        });
        expect(meta.map((m: ColumnMetadata) => m.normColName)).to.deep.equal(["score", "name"]);
      } finally {
        restore();
      }
    });
  });

  describe("type inference", () => {
    it("should infer integer measure for whole numbers", async () => {
      const jsonData = [{ val: 1 }, { val: 2 }, { val: 3 }];
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect(meta[0].type).to.equal("measure");
        expect(meta[0].subtype).to.equal("integer");
      } finally {
        restore();
      }
    });

    it("should infer decimal measure for decimal numbers", async () => {
      const jsonData = [{ val: 1.5 }, { val: 2.3 }, { val: 3.7 }];
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect(meta[0].type).to.equal("measure");
        expect(meta[0].subtype).to.equal("decimal");
      } finally {
        restore();
      }
    });

    it("should infer decimal measure when mix of integer and decimal numbers", async () => {
      const jsonData = [{ val: 1 }, { val: 2.5 }, { val: 3 }];
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect(meta[0].type).to.equal("measure");
        expect(meta[0].subtype).to.equal("decimal");
      } finally {
        restore();
      }
    });

    it("should infer integer measure for numeric strings", async () => {
      const csv = "val\n10\n20\n30";
      const restore = stubFetch(() => ({ status: 200, body: csv }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.csv", type: "csv" });
        expect(meta[0].type).to.equal("measure");
        expect(meta[0].subtype).to.equal("integer");
      } finally {
        restore();
      }
    });

    it("should infer decimal measure for decimal numeric strings", async () => {
      const csv = "val\n10.5\n20.3\n30.1";
      const restore = stubFetch(() => ({ status: 200, body: csv }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.csv", type: "csv" });
        expect(meta[0].type).to.equal("measure");
        expect(meta[0].subtype).to.equal("decimal");
      } finally {
        restore();
      }
    });

    it("should infer temporal dimension for ISO date strings", async () => {
      const jsonData = [
        { ts: "2024-01-15T10:30:00" },
        { ts: "2024-02-20T14:00:00" },
      ];
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect(meta[0].type).to.equal("dimension");
        expect(meta[0].subtype).to.equal("temporal");
      } finally {
        restore();
      }
    });

    it("should infer temporal dimension for ISO dates with space separator", async () => {
      const jsonData = [
        { ts: "2024-01-15 10:30:00" },
        { ts: "2024-02-20 14:00:00" },
      ];
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect(meta[0].type).to.equal("dimension");
        expect(meta[0].subtype).to.equal("temporal");
      } finally {
        restore();
      }
    });

    it("should infer dimension for non-numeric strings", async () => {
      const jsonData = [{ val: "hello" }, { val: "world" }, { val: "foo" }];
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect(meta[0].type).to.equal("dimension");
      } finally {
        restore();
      }
    });

    it("should infer dimension when all values are empty", async () => {
      const jsonData = [{ val: "" }, { val: null }, { val: "" }];
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify(jsonData) }));
      try {
        const meta = await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect(meta[0].type).to.equal("dimension");
      } finally {
        restore();
      }
    });
  });

  describe("error handling", () => {
    it("should throw FETCH_FAILED on network error", async () => {
      const restore = stubFetchError();
      try {
        await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).to.be.instanceOf(GridError);
        expect((e as GridError).code).to.equal(GridErrorCode.FETCH_FAILED);
      } finally {
        restore();
      }
    });

    it("should throw FETCH_FAILED on non-ok response", async () => {
      const restore = stubFetch(() => ({ status: 404, ok: false, body: "Not found" }));
      try {
        await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).to.be.instanceOf(GridError);
        expect((e as GridError).code).to.equal(GridErrorCode.FETCH_FAILED);
        expect((e as GridError).properties?.status).to.equal(404);
      } finally {
        restore();
      }
    });

    it("should throw PARSE_FAILED on invalid JSON", async () => {
      const restore = stubFetch(() => ({ status: 200, body: "not json{{{" }));
      try {
        await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).to.be.instanceOf(GridError);
        expect((e as GridError).code).to.equal(GridErrorCode.PARSE_FAILED);
      } finally {
        restore();
      }
    });

    it("should throw EMPTY_DATA on empty array", async () => {
      const restore = stubFetch(() => ({ status: 200, body: "[]" }));
      try {
        await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).to.be.instanceOf(GridError);
        expect((e as GridError).code).to.equal(GridErrorCode.EMPTY_DATA);
      } finally {
        restore();
      }
    });

    it("should throw INVALID_DATA when parsed data is not an array", async () => {
      const restore = stubFetch(() => ({ status: 200, body: JSON.stringify({ key: "value" }) }));
      try {
        await ds.loadDataFromURL({ url: "http://test.com/data.json", type: "json" });
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).to.be.instanceOf(GridError);
        expect((e as GridError).code).to.equal(GridErrorCode.INVALID_DATA);
      } finally {
        restore();
      }
    });
  });
});
