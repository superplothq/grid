import { expect } from "chai";
import { DuckDBDataSource } from "./duckdb-datasource";
import { SqlPivotTableDataModel } from "./sql-pivot-table-datamodel";
import { PivotDataViewModel } from "../renderer/pivot-data-viewmodel";
import { DataSchema, PivotConfig } from "./types";

// 24 rows, 8 dimensions + 4 measures (column-major format)
//
// | # | region         | country | city     | department  | product | channel   | quarter | segment  | revenue | cost | units_sold | returns |
// |---|----------------|---------|----------|-------------|---------|-----------|---------|----------|---------|------|------------|---------|
// | 0 | North America  | USA     | New York | Electronics | Laptop  | Online    | Q1      | Consumer | 1200    | 800  | 10         | 1       |
// | 1 | North America  | USA     | New York | Electronics | Laptop  | Online    | Q2      | Consumer | 1500    | 1000 | 12         | 2       |
// | 2 | North America  | USA     | New York | Electronics | Phone   | Retail    | Q1      | Consumer | 800     | 500  | 20         | 3       |
// | 3 | North America  | USA     | New York | Apparel     | Jacket  | Online    | Q1      | Consumer | 300     | 150  | 15         | 1       |
// | 4 | North America  | USA     | New York | Apparel     | Jacket  | Retail    | Q2      | Business | 350     | 175  | 18         | 2       |
// | 5 | North America  | USA     | Chicago  | Electronics | Laptop  | Online    | Q1      | Business | 1100    | 750  | 9          | 1       |
// | 6 | North America  | USA     | Chicago  | Electronics | Phone   | Retail    | Q2      | Consumer | 900     | 550  | 22         | 4       |
// | 7 | North America  | USA     | Chicago  | Apparel     | Shoes   | Online    | Q1      | Consumer | 250     | 120  | 25         | 2       |
// | 8 | North America  | Canada  | Toronto  | Electronics | Laptop  | Online    | Q1      | Consumer | 1000    | 700  | 8          | 1       |
// | 9 | North America  | Canada  | Toronto  | Electronics | Phone   | Online    | Q2      | Business | 700     | 450  | 16         | 2       |
// |10 | North America  | Canada  | Toronto  | Apparel     | Jacket  | Retail    | Q1      | Consumer | 280     | 140  | 14         | 1       |
// |11 | North America  | Canada  | Toronto  | Apparel     | Shoes   | Wholesale | Q2      | Business | 200     | 100  | 30         | 3       |
// |12 | Europe         | UK      | London   | Electronics | Laptop  | Online    | Q1      | Consumer | 1400    | 950  | 11         | 1       |
// |13 | Europe         | UK      | London   | Electronics | Phone   | Retail    | Q1      | Business | 850     | 520  | 19         | 3       |
// |14 | Europe         | UK      | London   | Apparel     | Jacket  | Online    | Q2      | Consumer | 400     | 200  | 20         | 2       |
// |15 | Europe         | UK      | London   | Apparel     | Shoes   | Retail    | Q2      | Business | 320     | 160  | 28         | 4       |
// |16 | Europe         | Germany | Berlin   | Electronics | Laptop  | Online    | Q1      | Consumer | 1300    | 880  | 10         | 1       |
// |17 | Europe         | Germany | Berlin   | Electronics | Phone   | Wholesale | Q2      | Business | 750     | 480  | 17         | 2       |
// |18 | Europe         | Germany | Berlin   | Apparel     | Jacket  | Retail    | Q1      | Consumer | 350     | 170  | 16         | 1       |
// |19 | Europe         | Germany | Berlin   | Apparel     | Shoes   | Online    | Q2      | Consumer | 280     | 135  | 22         | 3       |
// |20 | North America  | USA     | New York | Electronics | Phone   | Online    | Q3      | Business | 950     | 580  | 24         | 3       |
// |21 | Europe         | UK      | London   | Apparel     | Jacket  | Retail    | Q3      | Consumer | 380     | 190  | 17         | 2       |
// |22 | North America  | USA     | Chicago  | Apparel     | Jacket  | Wholesale | Q3      | Business | 290     | 145  | 13         | 1       |
// |23 | Europe         | Germany | Berlin   | Electronics | Laptop  | Retail    | Q3      | Consumer | 1350    | 900  | 11         | 1       |

const schemaColumns: (string | DataSchema)[] = [
  "region", "country", "city", "department", "product", "channel", "quarter", "segment",
  { name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum" },
  { name: "cost", displayName: "Cost", type: "measure", aggregateFn: "sum" },
  { name: "units_sold", displayName: "Units Sold", type: "measure", aggregateFn: "sum" },
  { name: "returns", displayName: "Returns", type: "measure", aggregateFn: "sum" },
];

const region     = ["North America","North America","North America","North America","North America","North America","North America","North America","North America","North America","North America","North America","Europe","Europe","Europe","Europe","Europe","Europe","Europe","Europe","North America","Europe","North America","Europe"];
const country    = ["USA","USA","USA","USA","USA","USA","USA","USA","Canada","Canada","Canada","Canada","UK","UK","UK","UK","Germany","Germany","Germany","Germany","USA","UK","USA","Germany"];
const city       = ["New York","New York","New York","New York","New York","Chicago","Chicago","Chicago","Toronto","Toronto","Toronto","Toronto","London","London","London","London","Berlin","Berlin","Berlin","Berlin","New York","London","Chicago","Berlin"];
const department = ["Electronics","Electronics","Electronics","Apparel","Apparel","Electronics","Electronics","Apparel","Electronics","Electronics","Apparel","Apparel","Electronics","Electronics","Apparel","Apparel","Electronics","Electronics","Apparel","Apparel","Electronics","Apparel","Apparel","Electronics"];
const product    = ["Laptop","Laptop","Phone","Jacket","Jacket","Laptop","Phone","Shoes","Laptop","Phone","Jacket","Shoes","Laptop","Phone","Jacket","Shoes","Laptop","Phone","Jacket","Shoes","Phone","Jacket","Jacket","Laptop"];
const channel    = ["Online","Online","Retail","Online","Retail","Online","Retail","Online","Online","Online","Retail","Wholesale","Online","Retail","Online","Retail","Online","Wholesale","Retail","Online","Online","Retail","Wholesale","Retail"];
const quarter    = ["Q1","Q2","Q1","Q1","Q2","Q1","Q2","Q1","Q1","Q2","Q1","Q2","Q1","Q1","Q2","Q2","Q1","Q2","Q1","Q2","Q3","Q3","Q3","Q3"];
const segment    = ["Consumer","Consumer","Consumer","Consumer","Business","Business","Consumer","Consumer","Consumer","Business","Consumer","Business","Consumer","Business","Consumer","Business","Consumer","Business","Consumer","Consumer","Business","Consumer","Business","Consumer"];
const revenue    = [1200,1500,800,300,350,1100,900,250,1000,700,280,200,1400,850,400,320,1300,750,350,280,950,380,290,1350];
const cost       = [800,1000,500,150,175,750,550,120,700,450,140,100,950,520,200,160,880,480,170,135,580,190,145,900];
const units_sold = [10,12,20,15,18,9,22,25,8,16,14,30,11,19,20,28,10,17,16,22,24,17,13,11];
const returns    = [1,2,3,1,2,1,4,2,1,2,1,3,1,3,2,4,1,2,1,3,3,2,1,1];

const data = [region, country, city, department, product, channel, quarter, segment, revenue, cost, units_sold, returns];

function resolveSchema(columns: (string | DataSchema)[]): DataSchema[] {
  return columns.map((col) => {
    if (typeof col === "string") {
      return { name: col, displayName: col, type: "dimension" as const };
    }
    return col;
  });
}

export async function makeModel() {
  const schema = resolveSchema(schemaColumns);
  const ds = DuckDBDataSource.create();
  await ds.loadData({ table: "data", schema, data });
  const model = new SqlPivotTableDataModel(schema, ds);
  return Object.assign(model, {
    async getViewModel(config: PivotConfig) {
      const args = await model.getViewModelData(config);
      return new PivotDataViewModel(args);
    },
  });
}

export async function makePatchedModel() {
  const model = await makeModel();
  const sqls: string[] = [];
  const ds = (model as any).dataSource;
  const origExecute = ds.execute.bind(ds);
  ds.execute = async (sql: string) => {
    sqls.push(sql);
    return origExecute(sql);
  };
  return Object.assign(model, {
    sqlStr: () => sqls[0],
  });
}

describe("PivotTableDataModel", () => {
  it("should have correct number of rows and columns", async () => {
    const model = await makeModel();
    const schema = (model as any).schema;
    expect(schema).to.have.length(12);
    expect(schema.filter((s: DataSchema) => s.type === "dimension")).to.have.length(8);
    expect(schema.filter((s: DataSchema) => s.type === "measure")).to.have.length(4);

    const rows = await (model as any).dataSource.execute("SELECT COUNT(*) as cnt FROM data");
    expect(Number(rows[0].cnt)).to.equal(24);
  });
});

describe("Schema extensions", () => {
  it("should store temporal columns as TIMESTAMP", async () => {
    const schema: DataSchema[] = [
      { name: "order_date", displayName: "Order Date", type: "dimension", subtype: "temporal" },
      { name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum" },
    ];
    const ds = DuckDBDataSource.create();
    await ds.loadData({
      table: "data",
      schema,
      data: [
        [new Date("2024-03-15").toISOString(), new Date("2023-12-25").toISOString(), new Date("2025-01-01").toISOString()],
        [100, 200, 300],
      ],
    });
    const model = new SqlPivotTableDataModel(schema, ds);

    const rows = await (model as any).dataSource.execute("SELECT order_date, revenue FROM data ORDER BY order_date");
    expect(rows).to.have.length(3);
    expect(new Date(rows[0].order_date).getFullYear()).to.equal(2023);
    expect(new Date(rows[1].order_date).getFullYear()).to.equal(2024);
    expect(new Date(rows[2].order_date).getFullYear()).to.equal(2025);
  });

  it("should load pre-transformed numeric data", async () => {
    const schema: DataSchema[] = [
      { name: "category", displayName: "category", type: "dimension" },
      { name: "amount", displayName: "Amount", type: "measure", aggregateFn: "sum" },
    ];
    const ds = DuckDBDataSource.create();
    await ds.loadData({
      table: "data",
      schema,
      data: [
        ["Electronics", "Apparel"],
        [1200, 950],
      ],
    });
    const model = new SqlPivotTableDataModel(schema, ds);

    const rows = await (model as any).dataSource.execute("SELECT category, amount FROM data ORDER BY amount");
    expect(rows).to.have.length(2);
    expect(Number(rows[0].amount)).to.equal(950);
    expect(Number(rows[1].amount)).to.equal(1200);
  });

  it("should handle temporal and numeric columns together", async () => {
    const schema: DataSchema[] = [
      { name: "sale_date", displayName: "Sale Date", type: "dimension", subtype: "temporal" },
      { name: "price", displayName: "Price", type: "measure", aggregateFn: "sum" },
    ];
    const ds = DuckDBDataSource.create();
    await ds.loadData({
      table: "data",
      schema,
      data: [
        [new Date("2024-03-15").toISOString(), new Date("2023-12-25").toISOString()],
        [500, 750],
      ],
    });
    const model = new SqlPivotTableDataModel(schema, ds);

    const rows = await (model as any).dataSource.execute("SELECT sale_date, price FROM data ORDER BY sale_date");
    expect(rows).to.have.length(2);
    expect(new Date(rows[0].sale_date).getFullYear()).to.equal(2023);
    expect(Number(rows[0].price)).to.equal(750);
    expect(new Date(rows[1].sale_date).getFullYear()).to.equal(2024);
    expect(Number(rows[1].price)).to.equal(500);
  });

  it("should clean dirty data via replace config", async () => {
    const schema: DataSchema[] = [
      { name: "product", type: "dimension" },
      { name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum" },
    ];
    const ds = DuckDBDataSource.create();
    await ds.loadData({
      table: "data",
      schema,
      data: [
        ["Widget", "Gadget"],
        ["$1,234", "$5,678"],
      ],
      replace: new Map([["revenue", new Map([["$", ""], [",", ""]])]]),
    });
    const model = new SqlPivotTableDataModel(schema, ds);

    const rows = await (model as any).dataSource.execute("SELECT product, revenue FROM data ORDER BY revenue");
    expect(rows).to.have.length(2);
    expect(Number(rows[0].revenue)).to.equal(1234);
    expect(Number(rows[1].revenue)).to.equal(5678);
  });

  it("should parse dates via datetimeFormat", async () => {
    const schema: DataSchema[] = [
      { name: "date", type: "dimension", subtype: "temporal", datetimeFormat: "%m/%d/%Y" },
      { name: "value", type: "measure", aggregateFn: "sum" },
    ];
    const ds = DuckDBDataSource.create();
    await ds.loadData({
      table: "data",
      schema,
      data: [
        ["03/15/2024", "12/25/2023", "01/01/2025"],
        [100, 200, 300],
      ],
    });
    const model = new SqlPivotTableDataModel(schema, ds);

    const rows = await (model as any).dataSource.execute("SELECT date, value FROM data ORDER BY date");
    expect(rows).to.have.length(3);
    expect(new Date(rows[0].date).getFullYear()).to.equal(2023);
    expect(new Date(rows[1].date).getFullYear()).to.equal(2024);
    expect(new Date(rows[2].date).getFullYear()).to.equal(2025);
  });
});
