import { expect } from "chai";
import { InMemoryDataModel } from "./in-memory-datamodel";
import { Schema, ROLLUP_MARKER } from "./types";
import { cross, concat, hierarchy } from "./grid-datamodel";

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

const schemaColumns: (string | Schema)[] = [
  "region", "country", "city", "department", "product", "channel", "quarter", "segment",
  { name: "revenue", displayName: "Revenue", type: "measure", aggregateFn: "sum" } as Schema,
  { name: "cost", displayName: "Cost", type: "measure", aggregateFn: "sum" } as Schema,
  { name: "units_sold", displayName: "Units Sold", type: "measure", aggregateFn: "sum" } as Schema,
  { name: "returns", displayName: "Returns", type: "measure", aggregateFn: "sum" } as Schema,
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

async function makeModel() {
  return InMemoryDataModel.create({ columns: schemaColumns, data });
}

describe("GridDataModel pivot (SUM aggregation)", () => {

  // ── Test 1: Simple pivot ──────────────────────────────────────────────
  // rows="region", columns=cross("department", "revenue")
  // 2 regions × 2 departments = 2×2 grid
  //
  // North America/Electronics: rows 0,1,2,5,6,8,9,20 → SUM revenue = 1200+1500+800+1100+900+1000+700+950 = 8150
  // North America/Apparel:     rows 3,4,7,10,11,22   → SUM revenue = 300+350+250+280+200+290 = 1670
  // Europe/Electronics:        rows 12,13,16,17,23    → SUM revenue = 1400+850+1300+750+1350 = 5650
  // Europe/Apparel:            rows 14,15,18,19,21    → SUM revenue = 400+320+350+280+380 = 1730
  describe("Simple pivot", () => {
    it("rows=region, columns=cross(department, revenue)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: "region",
        columns: cross("department", "revenue"),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
        ["revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, 2, 2).data).to.deep.equal([
        [8150, 5650],    // Electronics/revenue
        [1670, 1730],    // Apparel/revenue
      ]);
    });
  });

  // ── Test 2: Single measure column ─────────────────────────────────────
  // rows=hierarchy("region","country","city"), columns="revenue"
  //
  // New York:  rows 0,1,2,3,4,20 → SUM = 1200+1500+800+300+350+950 = 5100
  // Chicago:   rows 5,6,7,22     → SUM = 1100+900+250+290 = 2540
  // Toronto:   rows 8,9,10,11    → SUM = 1000+700+280+200 = 2180
  // London:    rows 12,13,14,15,21 → SUM = 1400+850+400+320+380 = 3350
  // Berlin:    rows 16,17,18,19,23 → SUM = 1300+750+350+280+1350 = 4030
  describe("Single measure column", () => {
    it("rows=hierarchy(region,country,city), columns=revenue", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: hierarchy("region", "country", "city"),
        columns: "revenue",
      });

      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 5).data).to.deep.equal([
        [5100, 2540, 2180, 3350, 4030],
      ]);
    });
  });

  // ── Test 3: Hierarchy on both axes ────────────────────────────────────
  // rows=hierarchy("region","country"), columns=cross(hierarchy("department","product"), "revenue")
  //
  // Row combos: NA/USA, NA/Canada, Europe/UK, Europe/Germany
  // Col combos (hierarchy dept+product): Electronics/Laptop, Electronics/Phone, Apparel/Jacket, Apparel/Shoes
  //
  // NA/USA × Elec/Laptop: rows 0,1,5       → 1200+1500+1100 = 3800
  // NA/USA × Elec/Phone:  rows 2,6,20      → 800+900+950 = 2650
  // NA/USA × App/Jacket:  rows 3,4,22      → 300+350+290 = 940
  // NA/USA × App/Shoes:   row 7             → 250
  // NA/Canada × Elec/Laptop: row 8          → 1000
  // NA/Canada × Elec/Phone:  row 9          → 700
  // NA/Canada × App/Jacket:  row 10         → 280
  // NA/Canada × App/Shoes:   row 11         → 200
  // Europe/UK × Elec/Laptop: row 12         → 1400
  // Europe/UK × Elec/Phone:  row 13         → 850
  // Europe/UK × App/Jacket:  rows 14,21     → 400+380 = 780
  // Europe/UK × App/Shoes:   row 15         → 320
  // Europe/Germany × Elec/Laptop: rows 16,23 → 1300+1350 = 2650
  // Europe/Germany × Elec/Phone:  row 17    → 750
  // Europe/Germany × App/Jacket:  row 18    → 350
  // Europe/Germany × App/Shoes:   row 19    → 280
  describe("Hierarchy on both axes", () => {
    it("rows=hierarchy(region,country), columns=cross(hierarchy(department,product), revenue)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: hierarchy("region", "country"),
        columns: cross(hierarchy("department", "product"), "revenue"),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Apparel", "Apparel"],
        ["Laptop", "Phone", "Jacket", "Shoes"],
        ["revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, 4, 4).data).to.deep.equal([
        [3800, 1000, 1400, 2650],   // Electronics/Laptop/revenue
        [2650, 700,  850,  750],    // Electronics/Phone/revenue
        [940,  280,  780,  350],    // Apparel/Jacket/revenue
        [250,  200,  320,  280],    // Apparel/Shoes/revenue
      ]);
    });
  });

  // ── Test 4: Cross with null combos ────────────────────────────────────
  // rows=cross("region","department"), columns=cross("channel", "revenue")
  //
  // Row combos (cartesian): NA/Electronics, NA/Apparel, Europe/Electronics, Europe/Apparel
  // Col combos: Online, Retail, Wholesale
  //
  // NA/Elec × Online:    rows 0,1,5,8,9,20   → 1200+1500+1100+1000+700+950 = 6450
  // NA/Elec × Retail:    rows 2,6             → 800+900 = 1700
  // NA/Elec × Wholesale: (none)               → null
  // NA/App × Online:     rows 3,7             → 300+250 = 550
  // NA/App × Retail:     rows 4,10            → 350+280 = 630
  // NA/App × Wholesale:  rows 11,22           → 200+290 = 490
  // Europe/Elec × Online:    rows 12,16       → 1400+1300 = 2700
  // Europe/Elec × Retail:    rows 13,23       → 850+1350 = 2200
  // Europe/Elec × Wholesale: row 17           → 750
  // Europe/App × Online:     rows 14,19       → 400+280 = 680
  // Europe/App × Retail:     rows 15,18,21    → 320+350+380 = 1050
  // Europe/App × Wholesale:  (none)           → null
  describe("Cross with null combos", () => {
    it("rows=cross(region,department), columns=cross(channel, revenue)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: cross("region", "department"),
        columns: cross("channel", "revenue"),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Online", "Retail", "Wholesale"],
        ["revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, 3, 4).data).to.deep.equal([
        [6450, 550,  2700, 680],     // Online/revenue
        [1700, 630,  2200, 1050],    // Retail/revenue
        [null, 490,  750,  null],    // Wholesale/revenue
      ]);
    });
  });

  // ── Test 5: Concat on columns (multi-group PivotQuery) ────────────────
  // rows="region", columns=cross(concat("department","channel"), "revenue")
  //
  // concat unions: Electronics, Apparel, Online, Retail, Wholesale
  // Each source row fans into 2 output cols (one for its department, one for its channel)
  //
  // NA × Electronics: rows 0,1,2,5,6,8,9,20   → SUM = 8150
  // NA × Apparel:     rows 3,4,7,10,11,22      → SUM = 1670
  // NA × Online:      rows 0,1,3,5,7,8,9,20    → SUM = 1200+1500+300+1100+250+1000+700+950 = 7000
  // NA × Retail:      rows 2,4,6,10             → SUM = 800+350+900+280 = 2330
  // NA × Wholesale:   rows 11,22                → SUM = 200+290 = 490
  // Europe × Electronics: rows 12,13,16,17,23   → SUM = 5650
  // Europe × Apparel:     rows 14,15,18,19,21   → SUM = 1730
  // Europe × Online:      rows 12,14,16,19      → SUM = 1400+400+1300+280 = 3380
  // Europe × Retail:      rows 13,15,18,21,23   → SUM = 850+320+350+380+1350 = 3250
  // Europe × Wholesale:   row 17                → SUM = 750
  describe("Concat on columns", () => {
    it("rows=region, columns=cross(concat(department,channel), revenue)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: "region",
        columns: cross(concat("department", "channel"), "revenue"),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel", "Online", "Retail", "Wholesale"],
        ["revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, 5, 2).data).to.deep.equal([
        [8150, 5650],    // Electronics/revenue
        [1670, 1730],    // Apparel/revenue
        [7000, 3380],    // Online/revenue
        [2330, 3250],    // Retail/revenue
        [490,  750],     // Wholesale/revenue
      ]);
    });
  });

  // ── Test 6: Multiple measures via concat ──────────────────────────────
  // rows=hierarchy("region","country"), columns=cross("department", concat("revenue","cost"))
  //
  // Row combos: NA/USA, NA/Canada, Europe/UK, Europe/Germany
  //
  // NA/USA × Elec/revenue:     rows 0,1,2,5,6,20 → 1200+1500+800+1100+900+950 = 6450
  // NA/USA × Elec/cost:        → 800+1000+500+750+550+580 = 4180
  // NA/USA × App/revenue:      rows 3,4,7,22     → 300+350+250+290 = 1190
  // NA/USA × App/cost:         → 150+175+120+145 = 590
  // NA/Canada × Elec/revenue:  rows 8,9          → 1000+700 = 1700
  // NA/Canada × Elec/cost:     → 700+450 = 1150
  // NA/Canada × App/revenue:   rows 10,11        → 280+200 = 480
  // NA/Canada × App/cost:      → 140+100 = 240
  // Europe/UK × Elec/revenue:  rows 12,13        → 1400+850 = 2250
  // Europe/UK × Elec/cost:     → 950+520 = 1470
  // Europe/UK × App/revenue:   rows 14,15,21     → 400+320+380 = 1100
  // Europe/UK × App/cost:      → 200+160+190 = 550
  // Europe/Germany × Elec/revenue: rows 16,17,23 → 1300+750+1350 = 3400
  // Europe/Germany × Elec/cost:    → 880+480+900 = 2260
  // Europe/Germany × App/revenue:  rows 18,19    → 350+280 = 630
  // Europe/Germany × App/cost:     → 170+135 = 305
  describe("Multiple measures via concat", () => {
    it("rows=hierarchy(region,country), columns=cross(department, concat(revenue,cost))", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: hierarchy("region", "country"),
        columns: cross("department", concat("revenue", "cost")),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Apparel", "Apparel"],
        ["revenue", "cost", "revenue", "cost"],
      ]);
      expect(vm.getSlice(0, 0, 4, 4).data).to.deep.equal([
        [6450, 1700, 2250, 3400],   // Electronics/revenue
        [4180, 1150, 1470, 2260],   // Electronics/cost
        [1190, 480,  1100, 630],    // Apparel/revenue
        [590,  240,  550,  305],    // Apparel/cost
      ]);
    });
  });

  // ── Test 7: Columns only (no rows) ────────────────────────────────────
  // columns=cross("department","revenue")
  // No row axis → single aggregated row
  //
  // Electronics: all elec rows → 1200+1500+800+1100+900+1000+700+1400+850+1300+750+950+1350 = 13800
  // Apparel: all app rows → 300+350+250+280+200+400+320+350+280+380+290 = 3400
  describe("Columns only (no rows)", () => {
    it("columns=cross(department,revenue)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        columns: cross("department", "revenue"),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
        ["revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, 2, 1).data).to.deep.equal([
        [13800],   // Electronics/revenue
        [3400],    // Apparel/revenue
      ]);
    });
  });

  // ── Test 8: Deep nesting ──────────────────────────────────────────────
  // rows=cross(hierarchy("region","country"), "channel"), columns=cross("department", concat("revenue","cost","units_sold"))
  //
  // Spot-check a few cells:
  // NA/USA/Online × Elec/revenue: rows 0,1,5,20 → 1200+1500+1100+950 = 4750
  // NA/USA/Online × Elec/cost:    → 800+1000+750+580 = 3130
  // NA/USA/Online × Elec/units:   → 10+12+9+24 = 55
  // NA/USA/Online × App/revenue:  rows 3,7 → 300+250 = 550
  // Europe/UK/Wholesale × any:    no data → null
  describe("Deep nesting", () => {
    it("rows=cross(hierarchy(region,country),channel), columns=cross(department, concat(revenue,cost,units_sold))", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: cross(hierarchy("region", "country"), "channel"),
        columns: cross("department", concat("revenue", "cost", "units_sold")),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Electronics", "Apparel", "Apparel", "Apparel"],
        ["revenue", "cost", "units_sold", "revenue", "cost", "units_sold"],
      ]);

      // Find the row index for NA/USA/Online (first row combo expected)
      const slice = vm.getSlice(0, 0, 6, vm.numRows);

      // NA/USA/Online should be one of the rows — check specific cells
      const rowFacets = slice.rowFacets!;
      const naUsaOnlineIdx = rowFacets.findIndex(
        (r: (string | null)[]) => r[0] === "North America" && r[1] === "USA" && r[2] === "Online"
      );
      expect(naUsaOnlineIdx).to.be.greaterThanOrEqual(0);
      expect(slice.data![0][naUsaOnlineIdx]).to.equal(4750);   // Elec/revenue
      expect(slice.data![1][naUsaOnlineIdx]).to.equal(3130);   // Elec/cost
      expect(slice.data![2][naUsaOnlineIdx]).to.equal(55);     // Elec/units_sold
      expect(slice.data![3][naUsaOnlineIdx]).to.equal(550);    // App/revenue

      // Europe/UK/Wholesale should be null (no data)
      const euroUkWholesaleIdx = rowFacets.findIndex(
        (r: (string | null)[]) => r[0] === "Europe" && r[1] === "UK" && r[2] === "Wholesale"
      );
      if (euroUkWholesaleIdx >= 0) {
        expect(slice.data![0][euroUkWholesaleIdx]).to.equal(null);
      }
    });

    // columns=cross(cross("region", concat("department","channel")), "revenue")
    // rows="quarter"
    //
    // Inner cross: region × concat(department, channel)
    //   → region × {Electronics, Apparel, Online, Retail, Wholesale}
    // Outer cross with revenue → 2×5 = 10 col combos, each with revenue measure
    //
    // Two branches from concat:
    //   branch 0: GROUP BY quarter, region, department → SUM(revenue)
    //   branch 1: GROUP BY quarter, region, channel   → SUM(revenue)
    //
    // NA/Elec:      Q1=4100  Q2=3100  Q3=950
    // NA/App:       Q1=830   Q2=550   Q3=290
    // NA/Online:    Q1=3850  Q2=2200  Q3=950
    // NA/Retail:    Q1=1080  Q2=1250  Q3=null
    // NA/Wholesale: Q1=null  Q2=200   Q3=290
    // EU/Elec:      Q1=3550  Q2=750   Q3=1350
    // EU/App:       Q1=350   Q2=1000  Q3=380
    // EU/Online:    Q1=2700  Q2=680   Q3=null
    // EU/Retail:    Q1=1200  Q2=320   Q3=1730
    // EU/Wholesale: Q1=null  Q2=750   Q3=null
    it("columns=cross(cross(region, concat(department,channel)), revenue) — nested cross", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: "quarter",
        columns: cross(cross("region", concat("department", "channel")), "revenue"),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["North America","North America","North America","North America","North America","Europe","Europe","Europe","Europe","Europe"],
        ["Electronics","Apparel","Online","Retail","Wholesale","Electronics","Apparel","Online","Retail","Wholesale"],
        ["revenue","revenue","revenue","revenue","revenue","revenue","revenue","revenue","revenue","revenue"],
      ]);
      expect(vm.getSlice(0, 0, 10, 3).data).to.deep.equal([
        [4100, 3100, 950],     // NA/Electronics/revenue
        [830,  550,  290],     // NA/Apparel/revenue
        [3850, 2200, 950],     // NA/Online/revenue
        [1080, 1250, null],    // NA/Retail/revenue
        [null, 200,  290],     // NA/Wholesale/revenue
        [3550, 750,  1350],    // Europe/Electronics/revenue
        [350,  1000, 380],     // Europe/Apparel/revenue
        [2700, 680,  null],    // Europe/Online/revenue
        [1200, 320,  1730],    // Europe/Retail/revenue
        [null, 750,  null],    // Europe/Wholesale/revenue
      ]);
    });
  });

  // ── Test 9: Cross single child ────────────────────────────────────────
  // rows="region", columns=cross("revenue")
  // Degenerate cross → same as bare "revenue"
  //
  // NA: all NA rows → SUM = 5100+2540+2180 = 9820
  // Europe: all Europe rows → SUM = 3350+4030 = 7380
  describe("Cross single child", () => {
    it("rows=region, columns=cross(revenue)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: "region",
        columns: cross("revenue"),
      });

      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 2).data).to.deep.equal([
        [9820, 7380],
      ]);
    });
  });

  // ── Test 10: Hierarchy single field ───────────────────────────────────
  // rows=hierarchy("region"), columns="revenue"
  // Same as bare "region" on rows
  describe("Hierarchy single field", () => {
    it("rows=hierarchy(region), columns=revenue", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: hierarchy("region"),
        columns: "revenue",
      });

      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 2).data).to.deep.equal([
        [9820, 7380],
      ]);
      expect(vm.getSlice(0, 0, 1, 2).rowFacets).to.deep.equal([
        ["North America"],
        ["Europe"],
      ]);
    });
  });

  // ── Test 11: All four measures ────────────────────────────────────────
  // rows=cross("region","department"), columns=concat("revenue","cost","units_sold","returns")
  //
  // NA/Electronics:     revenue=8150, cost=5330, units=130, returns=18
  //   cost: 800+1000+500+750+550+700+450+580 = 5330
  //   units: 10+12+20+9+22+8+16+24 = 121  ... wait let me recount
  //   rows 0,1,2,5,6,8,9,20
  //   units: 10+12+20+9+22+8+16+24 = 121
  //   returns: 1+2+3+1+4+1+2+3 = 17
  // NA/Apparel:         rows 3,4,7,10,11,22
  //   revenue=1670, cost=830, units=115, returns=10
  //   cost: 150+175+120+140+100+145 = 830
  //   units: 15+18+25+14+30+13 = 115
  //   returns: 1+2+2+1+3+1 = 10
  // Europe/Electronics: rows 12,13,16,17,23
  //   revenue=5650, cost=3830, units=68, returns=8
  //   cost: 950+520+880+480+900 = 3730 ... wait
  //   cost: 950+520+880+480+900 = 3730
  //   units: 11+19+10+17+11 = 68
  //   returns: 1+3+1+2+1 = 8
  // Europe/Apparel:     rows 14,15,18,19,21
  //   revenue=1730, cost=855, units=103, returns=12
  //   cost: 200+160+170+135+190 = 855
  //   units: 20+28+16+22+17 = 103
  //   returns: 2+4+1+3+2 = 12
  describe("All four measures", () => {
    it("rows=cross(region,department), columns=concat(revenue,cost,units_sold,returns)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: cross("region", "department"),
        columns: concat("revenue", "cost", "units_sold", "returns"),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["revenue", "cost", "units_sold", "returns"],
      ]);
      expect(vm.getSlice(0, 0, 4, 4).data).to.deep.equal([
        [8150, 1670, 5650, 1730],    // revenue
        [5330, 830,  3730, 855],     // cost
        [121,  115,  68,   103],     // units_sold
        [17,   10,   8,    12],      // returns
      ]);
    });
  });

  // ── Test 12: Concat on rows ───────────────────────────────────────────
  // rows=concat("region","channel"), columns=cross("department","revenue")
  //
  // Row facets: North America, Europe, Online, Retail, Wholesale (heterogeneous)
  //
  // NA × Electronics:     8150
  // NA × Apparel:         1670
  // Europe × Electronics: 5650
  // Europe × Apparel:     1730
  // Online × Electronics: rows 0,1,5,8,9,12,16,20 → 1200+1500+1100+1000+700+1400+1300+950 = 9150
  // Online × Apparel:     rows 3,7,14,19 → 300+250+400+280 = 1230
  // Retail × Electronics: rows 2,6,13,23 → 800+900+850+1350 = 3900
  // Retail × Apparel:     rows 4,10,15,18,21 → 350+280+320+350+380 = 1680
  // Wholesale × Electronics: row 17 → 750
  // Wholesale × Apparel:     rows 11,22 → 200+290 = 490
  describe("Concat on rows", () => {
    it("rows=concat(region,channel), columns=cross(department,revenue)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: concat("region", "channel"),
        columns: cross("department", "revenue"),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
        ["revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, 2, 5).data).to.deep.equal([
        [8150, 5650, 9150, 3900, 750],    // Electronics/revenue
        [1670, 1730, 1230, 1680, 490],    // Apparel/revenue
      ]);
    });
  });

  // ── Test 13: Concat on both axes ──────────────────────────────────────
  // rows=concat("region","department"), columns=cross(concat("channel","quarter"), "revenue")
  //
  // Row facets: North America, Europe, Electronics, Apparel
  // Col facets: Online, Retail, Wholesale, Q1, Q2, Q3
  //
  // NA × Online:     rows 0,1,3,5,7,8,9,20 → 1200+1500+300+1100+250+1000+700+950 = 7000
  // NA × Retail:     rows 2,4,6,10 → 800+350+900+280 = 2330
  // NA × Wholesale:  rows 11,22 → 200+290 = 490
  // NA × Q1:         rows 0,2,3,5,7,8,10 → 1200+800+300+1100+250+1000+280 = 4930
  // NA × Q2:         rows 1,4,6,9,11 → 1500+350+900+700+200 = 3650
  // NA × Q3:         rows 20,22 → 950+290 = 1240
  // Europe × Online: rows 12,14,16,19 → 1400+400+1300+280 = 3380
  // Europe × Retail: rows 13,15,18,21,23 → 850+320+350+380+1350 = 3250
  // Europe × Wholesale: row 17 → 750
  // Europe × Q1:     rows 12,13,16,18 → 1400+850+1300+350 = 3900
  // Europe × Q2:     rows 14,15,17,19 → 400+320+750+280 = 1750
  // Europe × Q3:     rows 21,23 → 380+1350 = 1730
  // Elec × Online:   rows 0,1,5,8,9,12,16,20 → 9150
  // Elec × Retail:   rows 2,6,13,23 → 3900
  // Elec × Wholesale: row 17 → 750
  // Elec × Q1:       rows 0,2,5,8,12,13,16 → 1200+800+1100+1000+1400+850+1300 = 7650
  // Elec × Q2:       rows 1,6,9,17 → 1500+900+700+750 = 3850
  // Elec × Q3:       rows 20,23 → 950+1350 = 2300
  // App × Online:    rows 3,7,14,19 → 1230
  // App × Retail:    rows 4,10,15,18,21 → 1680
  // App × Wholesale: rows 11,22 → 490
  // App × Q1:        rows 3,7,10,18 → 300+250+280+350 = 1180
  // App × Q2:        rows 4,11,14,15,19 → 350+200+400+320+280 = 1550
  // App × Q3:        rows 21,22 → 380+290 = 670
  describe("Concat on both axes", () => {
    it("rows=concat(region,department), columns=cross(concat(channel,quarter), revenue)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: concat("region", "department"),
        columns: cross(concat("channel", "quarter"), "revenue"),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Online", "Retail", "Wholesale", "Q1", "Q2", "Q3"],
        ["revenue", "revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, 6, 4).data).to.deep.equal([
        [7000, 3380, 9150, 1230],    // Online/revenue
        [2330, 3250, 3900, 1680],    // Retail/revenue
        [490,  750,  750,  490],     // Wholesale/revenue
        [4930, 3900, 7650, 1180],    // Q1/revenue
        [3650, 1750, 3850, 1550],    // Q2/revenue
        [1240, 1730, 2300, 670],     // Q3/revenue
      ]);
    });
  });

  // ── Test 14: Measure on row axis ──────────────────────────────────────
  // rows=cross("region", "revenue"), columns="department"
  // Measure comes from row axis. dimensions=["region","department"], measures=[{revenue,sum}]
  //
  // Same values as Test 1 but transposed: department on columns, region on rows with revenue
  describe("Measure on row axis", () => {
    it("rows=cross(region, revenue), columns=department", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: cross("region", "revenue"),
        columns: "department",
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
      ]);
      expect(vm.getSlice(0, 0, 2, 2).data).to.deep.equal([
        [8150, 5650],    // Electronics
        [1670, 1730],    // Apparel
      ]);
    });
  });

  // ── Test 15: 4-way cross on columns ───────────────────────────────────
  // rows="region", columns=cross("department","channel","quarter","revenue")
  //
  // dept: 2 × channel: 3 × quarter: 3 = 18 col combos
  // Many null cells for missing combos
  //
  // Spot-check:
  // NA × Elec/Online/Q1/revenue: rows 0,5,8 → 1200+1100+1000 = 3300
  // NA × Elec/Online/Q2/revenue: rows 1,9 → 1500+700 = 2200
  // NA × Elec/Online/Q3/revenue: row 20 → 950
  // NA × Elec/Wholesale/Q1/revenue: (none) → null
  // Europe × App/Retail/Q3/revenue: row 21 → 380
  describe("4-way cross on columns", () => {
    it("rows=region, columns=cross(department,channel,quarter,revenue) - spot checks", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: "region",
        columns: cross("department", "channel", "quarter", "revenue"),
      });

      const colFacets = vm.columnFacets;
      expect(colFacets.length).to.equal(4);

      // Find column indices for spot-checks
      const numCols = colFacets[0].length;
      function findCol(dept: string, chan: string, qtr: string): number {
        for (let i = 0; i < numCols; i++) {
          if (colFacets[0][i] === dept && colFacets[1][i] === chan && colFacets[2][i] === qtr) return i;
        }
        return -1;
      }

      const slice = vm.getSlice(0, 0, numCols, 2);

      // NA (row 0), Europe (row 1)
      const elecOnlineQ1 = findCol("Electronics", "Online", "Q1");
      expect(elecOnlineQ1).to.be.greaterThanOrEqual(0);
      expect(slice.data![elecOnlineQ1][0]).to.equal(3300);  // NA

      const elecOnlineQ2 = findCol("Electronics", "Online", "Q2");
      expect(slice.data![elecOnlineQ2][0]).to.equal(2200);  // NA

      const elecOnlineQ3 = findCol("Electronics", "Online", "Q3");
      expect(slice.data![elecOnlineQ3][0]).to.equal(950);   // NA

      // NA × Elec/Wholesale/Q1 = null
      const elecWholesaleQ1 = findCol("Electronics", "Wholesale", "Q1");
      if (elecWholesaleQ1 >= 0) {
        expect(slice.data![elecWholesaleQ1][0]).to.equal(null);
      }

      // Europe × App/Retail/Q3
      const appRetailQ3 = findCol("Apparel", "Retail", "Q3");
      expect(appRetailQ3).to.be.greaterThanOrEqual(0);
      expect(slice.data![appRetailQ3][1]).to.equal(380);  // Europe
    });
  });

  // ── Test 17: Concat hierarchy + string on rows ────────────────────────
  // rows=concat(hierarchy(region, country), department), columns="revenue"
  //
  // hierarchy(region, country) produces 2-level facet space:
  //   (North America, USA), (North America, Canada), (Europe, UK), (Europe, Germany)
  // "department" produces 1-level: Electronics, Apparel → padded to 2 levels with null
  //
  // Row facets (2 levels):
  //   level 0: [North America, North America, Europe, Europe, Electronics, Apparel]
  //   level 1: [USA, Canada, UK, Germany, null, null]
  //
  // Branch 1 (hierarchy): GROUP BY region, country → SUM(revenue)
  //   NA/USA:           rows 0–7,20,22 → 1200+1500+800+300+350+1100+900+250+950+290 = 7640
  //   NA/Canada:        rows 8–11      → 1000+700+280+200 = 2180
  //   Europe/UK:        rows 12–15,21  → 1400+850+400+320+380 = 3350
  //   Europe/Germany:   rows 16–19,23  → 1300+750+350+280+1350 = 4030
  //
  // Branch 2 (department): GROUP BY department → SUM(revenue)
  //   Electronics: rows 0,1,2,5,6,8,9,12,13,16,17,20,23 → 13800
  //   Apparel:     rows 3,4,7,10,11,14,15,18,19,21,22   → 3400
  describe("Concat hierarchy + string on rows", () => {
    it("rows=concat(hierarchy(region,country), department), columns=revenue", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: concat(hierarchy("region", "country"), "department"),
        columns: "revenue",
      });

      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe", "Electronics", "Apparel"],
        ["USA", "Canada", "UK", "Germany", null, null],
      ]);
      expect(vm.getSlice(0, 0, 1, 6).data).to.deep.equal([
        [7640, 2180, 3350, 4030, 13800, 3400],
      ]);
    });
  });

  // ── Test 18: Concat two hierarchies on rows ───────────────────────────
  // rows=concat(hierarchy(region, country), hierarchy(department, product)), columns="revenue"
  //
  // Both children are 2-level, no padding needed.
  //
  // Row facets (2 levels):
  //   level 0: [North America, North America, Europe, Europe, Electronics, Electronics, Apparel, Apparel]
  //   level 1: [USA, Canada, UK, Germany, Laptop, Phone, Jacket, Shoes]
  //
  // Branch 1: GROUP BY region, country → SUM(revenue)
  //   NA/USA: 7640, NA/Canada: 2180, Europe/UK: 3350, Europe/Germany: 4030
  //
  // Branch 2: GROUP BY department, product → SUM(revenue)
  //   Electronics/Laptop: rows 0,1,5,8,12,16,23 → 1200+1500+1100+1000+1400+1300+1350 = 8850
  //   Electronics/Phone:  rows 2,6,9,13,17,20   → 800+900+700+850+750+950 = 4950
  //   Apparel/Jacket:     rows 3,4,10,14,18,21,22 → 300+350+280+400+350+380+290 = 2350
  //   Apparel/Shoes:      rows 7,11,15,19        → 250+200+320+280 = 1050
  describe("Concat two hierarchies on rows", () => {
    it("rows=concat(hierarchy(region,country), hierarchy(department,product)), columns=revenue", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: concat(hierarchy("region", "country"), hierarchy("department", "product")),
        columns: "revenue",
      });

      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe", "Electronics", "Electronics", "Apparel", "Apparel"],
        ["USA", "Canada", "UK", "Germany", "Laptop", "Phone", "Jacket", "Shoes"],
      ]);
      expect(vm.getSlice(0, 0, 1, 8).data).to.deep.equal([
        [7640, 2180, 3350, 4030, 8850, 4950, 2350, 1050],
      ]);
    });
  });

  // ── Test 19: Concat hierarchy + string inside cross on columns ────────
  // rows="region", columns=cross(concat(hierarchy(department, product), channel), revenue)
  //
  // concat(hierarchy(department,product), channel) produces 2-level facet space:
  //   level 0: [Electronics, Electronics, Apparel, Apparel, Online, Retail, Wholesale]
  //   level 1: [Laptop, Phone, Jacket, Shoes, null, null, null]
  //
  // cross with "revenue" adds a 3rd level:
  //   level 2: [revenue × 7]
  //
  // Two branches from concat, each crossed with revenue:
  //   Branch 1: GROUP BY region, department, product → SUM(revenue)
  //   Branch 2: GROUP BY region, channel → SUM(revenue)
  //
  // NA × Electronics/Laptop:  rows 0,1,5,8    → 1200+1500+1100+1000 = 4800
  // NA × Electronics/Phone:   rows 2,6,9,20   → 800+900+700+950 = 3350
  // NA × Apparel/Jacket:      rows 3,4,10,22  → 300+350+280+290 = 1220
  // NA × Apparel/Shoes:       rows 7,11       → 250+200 = 450
  // NA × Online:              rows 0,1,3,5,7,8,9,20 → 7000
  // NA × Retail:              rows 2,4,6,10   → 2330
  // NA × Wholesale:           rows 11,22      → 490
  //
  // Europe × Electronics/Laptop: rows 12,16,23 → 1400+1300+1350 = 4050
  // Europe × Electronics/Phone:  rows 13,17    → 850+750 = 1600
  // Europe × Apparel/Jacket:     rows 14,18,21 → 400+350+380 = 1130
  // Europe × Apparel/Shoes:      rows 15,19    → 320+280 = 600
  // Europe × Online:             rows 12,14,16,19 → 3380
  // Europe × Retail:             rows 13,15,18,21,23 → 3250
  // Europe × Wholesale:          row 17        → 750
  describe("Concat hierarchy + string inside cross on columns", () => {
    it("rows=region, columns=cross(concat(hierarchy(department,product), channel), revenue)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: "region",
        columns: cross(concat(hierarchy("department", "product"), "channel"), "revenue"),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Apparel", "Apparel", "Online", "Retail", "Wholesale"],
        ["Laptop", "Phone", "Jacket", "Shoes", null, null, null],
        ["revenue", "revenue", "revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, 7, 2).data).to.deep.equal([
        [4800, 4050],     // Electronics/Laptop/revenue
        [3350, 1600],     // Electronics/Phone/revenue
        [1220, 1130],     // Apparel/Jacket/revenue
        [450,  600],      // Apparel/Shoes/revenue
        [7000, 3380],     // Online/revenue
        [2330, 3250],     // Retail/revenue
        [490,  750],      // Wholesale/revenue
      ]);
    });
  });

  // ── Drilldown tests ─────────────────────────────────────────────────────
  //
  // Revenue aggregations used across drilldown tests:
  //   Grand total: 17200
  //   Europe: 7380,  North America: 9820
  //   Europe/Germany: 4030,  Europe/UK: 3350
  //   North America/Canada: 2180,  North America/USA: 7640
  //   Europe/Germany/Berlin: 4030,  Europe/UK/London: 3350
  //   North America/Canada/Toronto: 2180
  //   North America/USA/Chicago: 2540,  North America/USA/New York: 5100
  //
  // Apparel total: 3400,  Electronics total: 13800
  // Apparel/Europe: 1730,  Apparel/Europe/Germany: 630,  Apparel/Europe/UK: 1100
  // Apparel/NA: 1670
  // Electronics/Europe: 5650,  Electronics/Europe/Germany: 3400,  Electronics/Europe/UK: 2250
  // Electronics/NA: 8150
  describe("drilldown", () => {
    const RUP = ROLLUP_MARKER;

    it("top level only", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { field: hierarchy("region", "country", "city"), drilldown: [{ toLevel: "region", where: "*" }] },
        columns: "revenue",
      });

      expect(vm.rowFacets).to.deep.equal([
        [RUP, "North America", "Europe"],
        [null, null, null],
        [null, null, null],
      ]);
      expect(vm.getSlice(0, 0, 1, 3).data).to.deep.equal([
        [17200, 9820, 7380],
      ]);
      expect(vm.rowDefs).to.deep.equal([
        { type: "agg", root: true },
        { type: "agg" },
        { type: "agg" },
      ]);
    });

    it("symmetric expand to country", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { field: hierarchy("region", "country", "city"), drilldown: [{ toLevel: "country", where: "*" }] },
        columns: "revenue",
      });

      expect(vm.rowFacets).to.deep.equal([
        [RUP, "North America", "North America", "North America", "Europe", "Europe", "Europe"],
        [null, null, "USA", "Canada", null, "UK", "Germany"],
        [null, null, null, null, null, null, null],
      ]);
      expect(vm.getSlice(0, 0, 1, 7).data).to.deep.equal([
        [17200, 9820, 7640, 2180, 7380, 3350, 4030],
      ]);
      expect(vm.rowDefs).to.deep.equal([
        { type: "agg", root: true },
        { type: "agg" },
        { type: "agg" },
        { type: "agg" },
        { type: "agg" },
        { type: "agg" },
        { type: "agg" },
      ]);
    });

    it("full expansion to city", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { field: hierarchy("region", "country", "city"), drilldown: [{ toLevel: "city", where: "*" }] },
        columns: "revenue",
      });

      expect(vm.rowFacets).to.deep.equal([
        [RUP, "North America", "North America", "North America", "North America", "North America", "North America", "Europe", "Europe", "Europe", "Europe", "Europe"],
        [null, null, "USA", "USA", "USA", "Canada", "Canada", null, "UK", "UK", "Germany", "Germany"],
        [null, null, null, "New York", "Chicago", null, "Toronto", null, null, "London", null, "Berlin"],
      ]);
      expect(vm.getSlice(0, 0, 1, 12).data).to.deep.equal([
        [17200, 9820, 7640, 5100, 2540, 2180, 2180, 7380, 3350, 3350, 4030, 4030],
      ]);
      expect(vm.rowDefs).to.deep.equal([
        { type: "agg", root: true },
        { type: "agg" },
        { type: "agg" },
        undefined,
        undefined,
        { type: "agg" },
        undefined,
        { type: "agg" },
        { type: "agg" },
        undefined,
        { type: "agg" },
        undefined,
      ]);
    });

    it("asymmetric single region", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: {
          field: hierarchy("region", "country", "city"),
          drilldown: [{ toLevel: "country", where: { region: ["Europe"] } }],
        },
        columns: "revenue",
      });

      expect(vm.rowFacets).to.deep.equal([
        [RUP, "North America", "Europe", "Europe", "Europe"],
        [null, null, null, "UK", "Germany"],
        [null, null, null, null, null],
      ]);
      expect(vm.getSlice(0, 0, 1, 5).data).to.deep.equal([
        [17200, 9820, 7380, 3350, 4030],
      ]);
    });

    it("asymmetric multi-level", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: {
          field: hierarchy("region", "country", "city"),
          drilldown: [
            { toLevel: "country", where: { region: ["Europe"] } },
            { toLevel: "city", where: { region: ["North America"], country: ["USA"] } },
          ],
        },
        columns: "revenue",
      });

      expect(vm.rowFacets).to.deep.equal([
        [RUP, "North America", "North America", "North America", "North America", "North America", "Europe", "Europe", "Europe"],
        [null, null, "USA", "USA", "USA", "Canada", null, "UK", "Germany"],
        [null, null, null, "New York", "Chicago", null, null, null, null],
      ]);
      expect(vm.getSlice(0, 0, 1, 9).data).to.deep.equal([
        [17200, 9820, 7640, 5100, 2540, 2180, 7380, 3350, 4030],
      ]);
    });

    it("implicit parent expansion", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: {
          field: hierarchy("region", "country", "city"),
          drilldown: [
            { toLevel: "city", where: { region: ["North America"], country: ["USA"] } },
          ],
        },
        columns: "revenue",
      });

      expect(vm.rowFacets).to.deep.equal([
        [RUP, "North America", "North America", "North America", "North America", "North America", "Europe"],
        [null, null, "USA", "USA", "USA", "Canada", null],
        [null, null, null, "New York", "Chicago", null, null],
      ]);
      expect(vm.getSlice(0, 0, 1, 7).data).to.deep.equal([
        [17200, 9820, 7640, 5100, 2540, 2180, 7380],
      ]);
    });

    it("concat on columns with drilldown on rows", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: {
          field: hierarchy("region", "country"),
          drilldown: [{ toLevel: "country", where: "*" }],
        },
        columns: concat("revenue", "cost"),
      });

      expect(vm.rowFacets).to.deep.equal([
        [RUP, "North America", "North America", "North America", "Europe", "Europe", "Europe"],
        [null, null, "USA", "Canada", null, "UK", "Germany"],
      ]);
      expect(vm.getSlice(0, 0, 2, 7).data).to.deep.equal([
        [17200, 9820, 7640, 2180, 7380, 3350, 4030],
        [10745, 6160, 4770, 1390, 4585, 2020, 2565],
      ]);
    });

    it("cross with drilldown", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: {
          field: cross("department", hierarchy("region", "country")),
          drilldown: [{ toLevel: "country", where: { region: ["Europe"] } }],
        },
        columns: "revenue",
      });

      expect(vm.rowFacets).to.deep.equal([
        ["Electronics", "Electronics", "Electronics", "Electronics", "Electronics", "Apparel", "Apparel", "Apparel", "Apparel", "Apparel"],
        [null, "North America", "Europe", "Europe", "Europe", null, "North America", "Europe", "Europe", "Europe"],
        [null, null, null, "UK", "Germany", null, null, null, "UK", "Germany"],
      ]);
      expect(vm.getSlice(0, 0, 1, 10).data).to.deep.equal([
        [13800, 8150, 5650, 2250, 3400, 3400, 1670, 1730, 1100, 630],
      ]);
    });
  });
});
