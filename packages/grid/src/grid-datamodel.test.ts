import { expect } from "chai";
import { concat, cross, hierarchy } from "./grid-datamodel";
import { InMemoryDataModel } from "./in-memory-datamodel";
import { Schema } from "./types";

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
  describe("[ported] Simple pivot", () => {
    it("[ported] rows=region, columns=cross(department, revenue)", async () => {
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
  describe("[ported] Single measure column", () => {
    it("[ported] rows=hierarchy(region,country,city), columns=revenue", async () => {
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
  describe("[ported] Hierarchy on both axes", () => {
    it("[ported] rows=hierarchy(region,country), columns=cross(hierarchy(department,product), revenue)", async () => {
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
  describe("[ported] Cross with null combos", () => {
    it("[ported] rows=cross(region,department), columns=cross(channel, revenue)", async () => {
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
  describe("[ported] Concat on columns", () => {
    it("[ported] rows=region, columns=cross(concat(department,channel), revenue)", async () => {
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
  describe("[ported] Multiple measures via concat", () => {
    it("[ported] rows=hierarchy(region,country), columns=cross(department, concat(revenue,cost))", async () => {
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
  describe.skip("[err] Columns only (no rows)", () => {
    it("columns=cross(department,revenue)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        columns: cross("department", "revenue"),
        rows: "" // TODO if this is supported, remove this
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
  describe("[ported] Deep nesting", () => {
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
  describe("[ported] Cross single child", () => {
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
  describe("[ported] Hierarchy single field", () => {
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
  describe("[na] All four measures", () => {
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
  describe("[na] Concat on rows", () => {
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
  describe("[ported] Concat on both axes", () => {
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
  describe("[ported] Measure on row axis", () => {
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
  describe("[ported] 4-way cross on columns", () => {
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
  describe("[ported] Concat hierarchy + string on rows", () => {
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
  describe("[ported] Concat two hierarchies on rows", () => {
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
  describe("[ported] Concat hierarchy + string inside cross on columns", () => {
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

  // ── Test 20/21: Measure-only axis ───────────────────────────────────
  describe("Measure-only axis", () => {
    // rows=concat("revenue","cost"), columns="department"
    // Row axis is all measures → rowDimCount=0
    //
    // Electronics: revenue=13800, cost=9060
    //   cost rows 0,1,2,5,6,8,9,12,13,16,17,20,23: 800+1000+500+750+550+700+450+950+520+880+480+580+900=9060
    // Apparel: revenue=3400, cost=1685
    //   cost rows 3,4,7,10,11,14,15,18,19,21,22: 150+175+120+140+100+200+160+170+135+190+145=1685
    it("rows=concat(revenue,cost), columns=department", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: concat("revenue", "cost"),
        columns: "department",
      });

      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
      ]);
      expect(vm.rowFacets).to.deep.equal([
        ["revenue", "cost"],
      ]);
      expect(vm.getSlice(0, 0, 2, 2).data).to.deep.equal([
        [13800, 9060],   // Electronics: revenue, cost
        [3400, 1685],    // Apparel: revenue, cost
      ]);
    });

    // rows="region", columns=concat("revenue","cost")
    // Col axis is all measures → colDimCount=0
    //
    // NA: revenue=9820, cost=6160
    //   cost rows 0-11,20,22: 800+1000+500+150+175+750+550+120+700+450+140+100+580+145=6160
    // Europe: revenue=7380, cost=4585
    //   cost rows 12-19,21,23: 950+520+200+160+880+480+170+135+190+900=4585
    it("rows=region, columns=concat(revenue,cost)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: "region",
        columns: concat("revenue", "cost"),
      });

      expect(vm.columnFacets).to.deep.equal([
        ["revenue", "cost"],
      ]);
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
      ]);
      expect(vm.getSlice(0, 0, 2, 2).data).to.deep.equal([
        [9820, 7380],    // revenue
        [6160, 4585],    // cost
      ]);
    });
  });

  // ── Drilldown tests ─────────────────────────────────────────────────────
  // Progressive drilldown with hierarchy, cross, and concat combinations.
  // Uses AxisConfig form: { expr: AxisExpr, drilldown: DrilldownPath[] }
  //
  // Level assignment for cross(hierarchy("region","country","city"), concat("department","channel")):
  //   cross child 0: hierarchy → region=L0, country=L1, city=L2
  //   cross child 1: concat(simple, simple) → L3 (concat is transparent, each simple is one level)
  //
  // drilldown: []                                                  → only L0 visible (region + nothing else)
  // drilldown: [{ open: "*" }]                                     → L0,L1 visible (region, country)
  // drilldown: [{ open: "*", next: { open: "*" } }]                → L0,L1,L2 visible (region, country, city)
  // drilldown: [{ open: "*", next: { open: "*", next: { open: "*" } } }]  → all visible (full expand)
  describe("Drilldown", () => {

    // ── Test: Hierarchy base drilldown ──────────────────────────────────
    // rows=hierarchy("region","country","city"), columns=cross(concat("department","channel"), "revenue")
    // drilldown: [] → show only region, country=null, city=null
    //
    // NA × Electronics: 8150    NA × Online: 7000    NA × Retail: 2330    NA × Wholesale: 490
    // NA × Apparel: 1670        Europe × Online: 3380  Europe × Retail: 3250  Europe × Wholesale: 750
    // Europe × Electronics: 5650  Europe × Apparel: 1730
    it("[ported] hierarchy base drilldown (L0 only)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: hierarchy("region", "country", "city"), projection: [] },
        columns: cross(concat("department", "channel"), "revenue"),
      });

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
        [null, null],
        [null, null],
      ]);
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

    // ── Test: Selective drilldown ────────────────────────────────────────
    // drilldown: [{ open: ["North America"] }]
    // → expand country for NA only, Europe stays collapsed
    //
    // NA/USA × Electronics: 6450       NA/Canada × Electronics: 1700
    // NA/USA × Apparel: 1190           NA/Canada × Apparel: 480
    // NA/USA × Online: 5300            NA/Canada × Online: 1700
    // NA/USA × Retail: 2050            NA/Canada × Retail: 280
    // NA/USA × Wholesale: 290          NA/Canada × Wholesale: 200
    // Europe × (same as base)
    it("[ported] selective drilldown (expand country for NA only)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: hierarchy("region", "country", "city"), projection: [{ open: ["North America"] }] },
        columns: cross(concat("department", "channel"), "revenue"),
      });

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe"],
        ["USA", "Canada", null],
        [null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel", "Online", "Retail", "Wholesale"],
        ["revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, 5, 3).data).to.deep.equal([
        [6450, 1700, 5650],    // Electronics/revenue
        [1190, 480,  1730],    // Apparel/revenue
        [5300, 1700, 3380],    // Online/revenue
        [2050, 280,  3250],    // Retail/revenue
        [290,  200,  750],     // Wholesale/revenue
      ]);
    });

    // ── Test: Progressive drilldown with selective city expansion ────────
    // drilldown: [{ open: "*", next: { open: ["USA"] } }]
    // → all countries visible, then expand city for USA only
    //
    // NA/USA/NewYork, NA/USA/Chicago, NA/Canada(city=null), Europe/UK(city=null), Europe/Germany(city=null)
    it("progressive drilldown (all countries, city for USA only)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: hierarchy("region", "country", "city"), projection: [{ open: "*", next: { open: ["USA"] } }] },
        columns: cross(concat("department", "channel"), "revenue"),
      });

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "North America", "Europe", "Europe"],
        ["USA", "USA", "Canada", "UK", "Germany"],
        ["New York", "Chicago", null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel", "Online", "Retail", "Wholesale"],
        ["revenue", "revenue", "revenue", "revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, 5, 5).data).to.deep.equal([
        [4450, 2000, 1700, 2250, 3400],  // Electronics/revenue
        [650,  540,  480,  1100, 630],    // Apparel/revenue
        [3950, 1350, 1700, 1800, 1580],   // Online/revenue
        [1150, 900,  280,  1550, 1700],    // Retail/revenue
        [null, 290,  200,  null, 750],     // Wholesale/revenue
      ]);
    });

    // ── Test: Drilldown on both axes ────────────────────────────────────
    // rows: hierarchy("region","country") with drilldown: [] → region only
    // columns: cross(hierarchy("department","product"), concat("revenue","cost")) with drilldown: [] → department only
    it("drilldown on both axes (base state)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: hierarchy("region", "country"), projection: [] },
        columns: { expr: cross(hierarchy("department", "product"), concat("revenue", "cost")), projection: [] },
      });

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
        [null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Apparel", "Apparel"],
        [null, null, null, null],
        ["revenue", "cost", "revenue", "cost"],
      ]);
      expect(vm.getSlice(0, 0, 4, 2).data).to.deep.equal([
        [8150, 5650],   // Electronics/null/revenue
        [5330, 3730],   // Electronics/null/cost
        [1670, 1730],   // Apparel/null/revenue
        [830,  855],    // Apparel/null/cost
      ]);
    });

    // ── Test: Drill both axes deeper ────────────────────────────────────
    // rows: hierarchy("region","country") with drilldown: [{ open: "*" }] → country visible
    // columns: cross(hierarchy("department","product"), concat("revenue","cost")) with drilldown: [{ open: "*" }] → product visible
    it("drilldown on both axes (fully expanded)", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: hierarchy("region", "country"), projection: [{ open: "*" }] },
        columns: { expr: cross(hierarchy("department", "product"), concat("revenue", "cost")), projection: [{ open: "*" }] },
      });

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe"],
        ["USA", "Canada", "UK", "Germany"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Electronics", "Electronics", "Electronics", "Apparel", "Apparel", "Apparel", "Apparel"],
        ["Laptop", "Laptop", "Phone", "Phone", "Jacket", "Jacket", "Shoes", "Shoes"],
        ["revenue", "cost", "revenue", "cost", "revenue", "cost", "revenue", "cost"],
      ]);
      expect(vm.getSlice(0, 0, 8, 4).data).to.deep.equal([
        [3800, 1000, 1400, 2650],   // Elec/Laptop/revenue
        [2550, 700,  950,  1780],   // Elec/Laptop/cost
        [2650, 700,  850,  750],    // Elec/Phone/revenue
        [1630, 450,  520,  480],    // Elec/Phone/cost
        [940,  280,  780,  350],    // App/Jacket/revenue
        [470,  140,  390,  170],    // App/Jacket/cost
        [250,  200,  320,  280],    // App/Shoes/revenue
        [120,  100,  160,  135],    // App/Shoes/cost
      ]);
    });

    // ── Test: Backward compatibility ────────────────────────────────────
    // Plain AxisExpr (no drilldown) should work exactly as before
    it("backward compatible — plain AxisExpr unchanged", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: hierarchy("region", "country"),
        columns: cross("department", "revenue"),
      });

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe"],
        ["USA", "Canada", "UK", "Germany"],
      ]);
      expect(vm.columnFacets).to.deep.equal([
        ["Electronics", "Apparel"],
        ["revenue", "revenue"],
      ]);
      expect(vm.getSlice(0, 0, 2, 4).data).to.deep.equal([
        [6450, 1700, 2250, 3400],
        [1190, 480,  1100, 630],
      ]);
    });

    // ── Concat hierarchy drilldown ──────────────────────────────────────
    // concat(hierarchy("region","country","city"), hierarchy("department","product"))
    //
    // Level ranges (concat is transparent):
    //   hierarchy(region,country,city) [0,2]    region=L0, country=L1, city=L2
    //   hierarchy(department,product)  [0,1]    department=L0, product=L1
    //
    // Ordering (MIN rowid):
    //   Regions: NA=0, Europe=12  |  Departments: Electronics=0, Apparel=3
    //   Countries: USA=0, Canada=8, UK=12, Germany=16
    //   Products: Laptop=0, Phone=2, Jacket=3, Shoes=7
    //   Cities: New York=0, Chicago=5, Toronto=8, London=12, Berlin=16
    const concatRows = concat(
      hierarchy("region", "country", "city"),
      hierarchy("department", "product"),
    );

    it("concat hierarchy L0 only", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: concatRows, projection: [] },
        columns: "revenue",
      });

      // Branch A: region only (country=null, city=null)
      // Branch B: department only (product=null)
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe", "Electronics", "Apparel"],
        [null, null, null, null],
        [null, null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 4).data).to.deep.equal([
        [9820, 7380, 13800, 3400],
      ]);
    });

    it("concat hierarchy L1 wildcard", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: concatRows, projection: [{ open: "*" }] },
        columns: "revenue",
      });

      // Branch A: region+country visible, city=null
      // Branch B: department+product visible (fully expanded)
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe",
          "Electronics", "Electronics", "Apparel", "Apparel"],
        ["USA", "Canada", "UK", "Germany",
          "Laptop", "Phone", "Jacket", "Shoes"],
        [null, null, null, null, null, null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 8).data).to.deep.equal([
        [7640, 2180, 3350, 4030, 8850, 4950, 2350, 1050],
      ]);
    });

    it("concat hierarchy L2 wildcard", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: concatRows, projection: [{ open: "*", next: { open: "*" } }] },
        columns: "revenue",
      });

      // Branch A: fully expanded (region/country/city)
      // Branch B: already fully expanded at L1, L2 beyond range — unchanged
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "North America",
          "Europe", "Europe",
          "Electronics", "Electronics", "Apparel", "Apparel"],
        ["USA", "USA", "Canada", "UK", "Germany",
          "Laptop", "Phone", "Jacket", "Shoes"],
        ["New York", "Chicago", "Toronto", "London", "Berlin",
          null, null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 9).data).to.deep.equal([
        [5100, 2540, 2180, 3350, 4030, 8850, 4950, 2350, 1050],
      ]);
    });

    it("concat hierarchy L1 selective — expand country for Europe only", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: concatRows, projection: [{ open: ["Europe"] }] },
        columns: "revenue",
      });

      // Branch A: selective on region — Europe expands to country, NA stays at region
      // Branch B: "region" not in department/product fields — stays at L0
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe", "Europe", "Electronics", "Apparel"],
        [null, "UK", "Germany", null, null],
        [null, null, null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 5).data).to.deep.equal([
        [9820, 3350, 4030, 13800, 3400],
      ]);
    });

    it("concat hierarchy L1 selective — expand product for Electronics only", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: concatRows, projection: [{ open: ["Electronics"] }] },
        columns: "revenue",
      });

      // Branch A: "department" not in region/country/city fields — stays at L0
      // Branch B: selective — Electronics expands to product, Apparel stays
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe", "Electronics", "Electronics", "Apparel"],
        [null, null, "Laptop", "Phone", null],
        [null, null, null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 5).data).to.deep.equal([
        [9820, 7380, 8850, 4950, 3400],
      ]);
    });

    it("concat hierarchy L1 selective + L2 wildcard", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: concatRows, projection: [{ open: ["Europe"], next: { open: "*" } }] },
        columns: "revenue",
      });

      // Branch A: Europe expanded to country at L1, then L2 wildcard expands city
      //   NA stayed at L0 (selective didn't open it), L2 can't expand what L1 didn't open
      // Branch B: L1 selective didn't apply (no "region" field) so branch stayed at L0.
      //   L2 wildcard can't expand what L1 didn't open — stays at L0 (department only)
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe", "Europe",
          "Electronics", "Apparel"],
        [null, "UK", "Germany",
          null, null],
        [null, "London", "Berlin", null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 5).data).to.deep.equal([
        [9820, 3350, 4030, 13800, 3400],
      ]);
    });

    // ── Cross with hierarchy drilldown ──────────────────────────────────
    // cross("region", hierarchy("department","product"))
    //
    // Level ranges:
    //   cross [0,2]
    //   ├── simple(region) [0,0]              region=L0
    //   └── hierarchy(department,product) [1,2]  department=L1, product=L2
    //
    // Ordering (MIN rowid):
    //   Regions: NA=0, Europe=12
    //   Departments: Electronics=0, Apparel=3
    //   Products: Laptop=0, Phone=2, Jacket=3, Shoes=7
    const crossHierRows = cross("region", hierarchy("department", "product"));

    it("cross-hierarchy L0 only", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: crossHierRows, projection: [] },
        columns: "revenue",
      });

      // region visible, department/product null → cross segments groupTill:0
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe"],
        [null, null],
        [null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 2).data).to.deep.equal([
        [9820, 7380],
      ]);
    });

    it("cross-hierarchy L1 wildcard", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: crossHierRows, projection: [{ open: "*" }] },
        columns: "revenue",
      });

      // region + department visible, product null
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "Europe", "Europe"],
        ["Electronics", "Apparel", "Electronics", "Apparel"],
        [null, null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 4).data).to.deep.equal([
        [8150, 1670, 5650, 1730],
      ]);
    });

    it("cross-hierarchy L2 wildcard", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: crossHierRows, projection: [{ open: "*", next: { open: "*" } }] },
        columns: "revenue",
      });

      // fully expanded: region × department × product
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "North America", "North America",
          "Europe", "Europe", "Europe", "Europe"],
        ["Electronics", "Electronics", "Apparel", "Apparel",
          "Electronics", "Electronics", "Apparel", "Apparel"],
        ["Laptop", "Phone", "Jacket", "Shoes",
          "Laptop", "Phone", "Jacket", "Shoes"],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 8).data).to.deep.equal([
        [4800, 3350, 1220, 450, 4050, 1600, 1130, 600],
      ]);
    });

    it("cross-hierarchy L1+L2 selective — expand product for Electronics only", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: crossHierRows, projection: [{ open: "*", next: { open: ["Electronics"] } }] },
        columns: "revenue",
      });

      // L1 wildcard opens department for all regions
      // L2 selective: department is the field at L1 (parent of L2), matches hierarchy
      //   Electronics expands to product, Apparel stays at department
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "North America", "North America",
          "Europe", "Europe", "Europe"],
        ["Electronics", "Electronics", "Apparel",
          "Electronics", "Electronics", "Apparel"],
        ["Laptop", "Phone", null, "Laptop", "Phone", null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 6).data).to.deep.equal([
        [4800, 3350, 1670, 4050, 1600, 1730],
      ]);
    });

    // ── Nested cross with hierarchy drilldown ───────────────────────────
    // cross(cross("channel","quarter"), hierarchy("department","product"))
    //
    // Level ranges:
    //   outer cross [0,3]
    //   ├── inner cross [0,1]                     channel=L0, quarter=L1
    //   └── hierarchy(department,product) [2,3]   department=L2, product=L3
    //
    // Ordering (MIN rowid):
    //   Channels: Online=0, Retail=2, Wholesale=11
    //   Quarters: Q1=0, Q2=1, Q3=20
    //   Departments: Electronics=0, Apparel=3
    //   Products: Laptop=0, Phone=2, Jacket=3, Shoes=7
    const nestedCrossRows = cross(cross("channel", "quarter"), hierarchy("department", "product"));

    it("nested-cross L0 only", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: nestedCrossRows, projection: [] },
        columns: "revenue",
      });

      // channel visible, quarter/department/product null
      expect(vm.rowFacets).to.deep.equal([
        ["Online", "Retail", "Wholesale"],
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 3).data).to.deep.equal([
        [10380, 5580, 1240],
      ]);
    });

    it("nested-cross L1 wildcard", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: nestedCrossRows, projection: [{ open: "*" }] },
        columns: "revenue",
      });

      // channel+quarter visible, department/product null
      // Wholesale/Q1 has no data → null revenue
      expect(vm.rowFacets).to.deep.equal([
        ["Online", "Online", "Online",
          "Retail", "Retail", "Retail",
          "Wholesale", "Wholesale", "Wholesale"],
        ["Q1", "Q2", "Q3", "Q1", "Q2", "Q3", "Q1", "Q2", "Q3"],
        [null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 9).data).to.deep.equal([
        [6550, 2880, 950, 2280, 1570, 1730, null, 950, 290],
      ]);
    });

    it("nested-cross L2 wildcard", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: nestedCrossRows, projection: [{ open: "*", next: { open: "*" } }] },
        columns: "revenue",
      });

      // channel+quarter+department visible, product null
      // 3 channels × 3 quarters × 2 departments = 18 combos
      expect(vm.rowFacets).to.deep.equal([
        ["Online", "Online", "Online", "Online", "Online", "Online",
          "Retail", "Retail", "Retail", "Retail", "Retail", "Retail",
          "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale"],
        ["Q1", "Q1", "Q2", "Q2", "Q3", "Q3",
          "Q1", "Q1", "Q2", "Q2", "Q3", "Q3",
          "Q1", "Q1", "Q2", "Q2", "Q3", "Q3"],
        ["Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel",
          "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel",
          "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel"],
        [null, null, null, null, null, null,
          null, null, null, null, null, null,
          null, null, null, null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 18).data).to.deep.equal([
        [6000, 550, 2200, 680, 950, null,
          1650, 630, 900, 670, 1350, 380,
          null, null, 750, 200, null, 290],
      ]);
    });

    it("nested-cross L3 selective — expand product for Electronics only", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: nestedCrossRows, projection: [{ open: "*", next: { open: "*", next: { open: ["Electronics"] } } }] },
        columns: "revenue",
      });

      // L1+L2 open quarter+department for all channels
      // L3 selective: department="Electronics" is in hierarchy fields → match
      //   Electronics expands to product, Apparel stays at department
      // 3 channels × 3 quarters × (2 Elec products + 1 Apparel) = 27 combos
      expect(vm.rowFacets).to.deep.equal([
        ["Online", "Online", "Online", "Online", "Online", "Online", "Online", "Online", "Online",
          "Retail", "Retail", "Retail", "Retail", "Retail", "Retail", "Retail", "Retail", "Retail",
          "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale", "Wholesale"],
        ["Q1", "Q1", "Q1", "Q2", "Q2", "Q2", "Q3", "Q3", "Q3",
          "Q1", "Q1", "Q1", "Q2", "Q2", "Q2", "Q3", "Q3", "Q3",
          "Q1", "Q1", "Q1", "Q2", "Q2", "Q2", "Q3", "Q3", "Q3"],
        ["Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel",
          "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel",
          "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel", "Electronics", "Electronics", "Apparel"],
        ["Laptop", "Phone", null, "Laptop", "Phone", null, "Laptop", "Phone", null,
          "Laptop", "Phone", null, "Laptop", "Phone", null, "Laptop", "Phone", null,
          "Laptop", "Phone", null, "Laptop", "Phone", null, "Laptop", "Phone", null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 27).data).to.deep.equal([
        [6000, null, 550,  1500, 700, 680,  null, 950, null,
          null, 1650, 630,  null, 900, 670,  1350, null, 380,
          null, null, null,  null, 750, 200,  null, null, 290],
      ]);
    });

    // ── Cross with two hierarchies — global chain rule ───────────────────
    // cross(hierarchy("region","country"), hierarchy("department","product"))
    //
    // Level ranges:
    //   outer cross [0,3]
    //   ├── hierarchy(region,country) [0,1]            region=L0, country=L1
    //   └── hierarchy(department,product) [2,3]        department=L2, product=L3
    //
    // Key scenario: selective L1 where:{region:["Europe"]} + L2 wildcard
    //   L1 only opens Europe → L2 should only expand department for Europe rows.
    //   North America rows stay fully collapsed (country=null, department=null).
    const crossHierHierRows = cross(hierarchy("region", "country"), hierarchy("department", "product"));

    it("cross(hier,hier) selective L1 + L2 — global chain gates second child", async () => {
      const model = await makeModel();
      const vm = await model.getViewModelData({
        rows: { expr: crossHierHierRows, projection: [{ open: ["Europe"], next: { open: "*" } }] },
        // rows: { expr: crossHierHierRows, drilldown: [
        //   { open: ["Europe"], next: { open: "*" } },
        //   { open: ["Europe"], next: { open: ["London"] } },
        //   { open: ["North America"], next: { open: ["USA"], next: { open: ["Electronics"], next: { open: "*" } } } },
        // ] },
        columns: "revenue",
      });

      // L1 selective: country visible only for Europe. NA stays collapsed.
      // L2 wildcard: department expands, but only for Europe (because L1 only opened Europe).
      //
      // Expected rows:
      //   North America / null / null / null   → all NA: 9820
      //   Europe / UK / Electronics / null     → rows 12,13 = 1400+850 = 2250
      //   Europe / UK / Apparel / null         → rows 14,15,21 = 400+320+380 = 1100
      //   Europe / Germany / Electronics / null → rows 16,17,23 = 1300+750+1350 = 3400
      //   Europe / Germany / Apparel / null    → rows 18,19 = 350+280 = 630
      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe", "Europe", "Europe", "Europe"],
        [null, "UK", "UK", "Germany", "Germany"],
        [null, "Electronics", "Apparel", "Electronics", "Apparel"],
        [null, null, null, null, null],
      ]);
      expect(vm.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm.getSlice(0, 0, 1, 5).data).to.deep.equal([
        [9820, 2250, 1100, 3400, 630],
      ]);
    });

    // ── Test: Deep nesting drilldown ──────────────────────────────────────
    // rows = concat(
    //   cross(hierarchy("region","country"), "department"),   ← branch A
    //   cross("channel", "department")                       ← branch B
    // )
    // columns = "revenue"
    //
    // DimSpec tree with level assignments:
    //   concat [0,2]                       ← transparent
    //   ├── cross:A [0,2]
    //   │   ├── hierarchy(region,country) [0,1]   region=L0, country=L1
    //   │   └── simple(department) [2,2]          department=L2
    //   └── cross:B [0,1]
    //       ├── simple(channel) [0,0]             channel=L0
    //       └── simple(department) [1,1]          department=L1
    //
    // concat range = max(2,1) = [0,2], aliased to __c__0, __c__1, __c__2
    //
    // drilldown:[] (L0 only):
    //   Branch A: hierarchy → region only (country=null), dept at L2 → null
    //   Branch B: channel visible, dept at L1 → null
    //   Rows: NA, Europe, Online, Retail, Wholesale  (all with __c__1=null, __c__2=null)
    //
    // drilldown:[{level:1}] (L0+L1):
    //   Branch A: hierarchy → region+country, dept at L2 → null
    //   Branch B: channel visible, dept at L1 → visible
    //   Rows: NA/USA, NA/Canada, Europe/UK, Europe/Germany,
    //         Online/Electronics, Online/Apparel, Retail/Electronics, Retail/Apparel,
    //         Wholesale/Electronics, Wholesale/Apparel
    //
    // drilldown:[{level:1},{level:2}] (all visible):
    //   Branch A: hierarchy fully expanded, dept visible
    //   Branch B: unchanged from L1 (already fully expanded at L1)
    //   Rows: NA/USA/Elec, NA/USA/App, ..., Online/Elec/null, ...
    describe("Deep nesting drilldown", () => {
      const deepRows = concat(
        cross(hierarchy("region", "country"), "department"),
        cross("channel", "department"),
      );

      it("L0 only — regions and channels", async () => {
        const model = await makeModel();
        const vm = await model.getViewModelData({
          rows: { expr: deepRows, projection: [] },
          columns: "revenue",
        });

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Online", "Retail", "Wholesale"],
          [null, null, null, null, null],
          [null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, 1, 5).data).to.deep.equal([
          [9820, 7380, 10380, 5580, 1240],
        ]);
      });

      it("L0+L1 — countries and channel×department", async () => {
        const model = await makeModel();
        const vm = await model.getViewModelData({
          rows: { expr: deepRows, projection: [{ open: "*" }] },
          columns: "revenue",
        });

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "Europe", "Europe",
            "Online", "Online", "Retail", "Retail", "Wholesale", "Wholesale"],
          ["USA", "Canada", "UK", "Germany",
            "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel"],
          [null, null, null, null, null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, 1, 10).data).to.deep.equal([
          [7640, 2180, 3350, 4030, 9150, 1230, 3900, 1680, 750, 490],
        ]);
      });

      it("L0+L1+L2 — full expansion", async () => {
        const model = await makeModel();
        const vm = await model.getViewModelData({
          rows: { expr: deepRows, projection: [{ open: "*", next: { open: "*" } }] },
          columns: "revenue",
        });

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "North America", "North America",
            "Europe", "Europe", "Europe", "Europe",
            "Online", "Online", "Retail", "Retail", "Wholesale", "Wholesale"],
          ["USA", "USA", "Canada", "Canada", "UK", "UK", "Germany", "Germany",
            "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel"],
          ["Electronics", "Apparel", "Electronics", "Apparel",
            "Electronics", "Apparel", "Electronics", "Apparel",
            null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, 1, 14).data).to.deep.equal([
          [6450, 1190, 1700, 480, 2250, 1100, 3400, 630,
            9150, 1230, 3900, 1680, 750, 490],
        ]);
      });

      it("selective drilldown — expand country for Europe only", async () => {
        const model = await makeModel();
        const vm = await model.getViewModelData({
          rows: { expr: deepRows, projection: [{ open: ["Europe"] }] },
          columns: "revenue",
        });

        // Branch A: hierarchy with selective → Europe gets country, NA stays collapsed
        //   Segments: [{groupTill:"country", filter:{region,["Europe"],include:true}},
        //             {groupTill:"region", filter:{region,["Europe"],include:false}}]
        //   dept at L2 still null
        // Branch B: channel visible, dept at L1... selective where references region
        //   which isn't in branch B's fields. maxVisible=1, so dept at L1 becomes visible.
        //
        // Branch A rows: Europe/UK/null, Europe/Germany/null, North America/null/null
        // Branch B rows: Online/Electronics/null, Online/Apparel/null, Retail/Electronics/null,
        //                Retail/Apparel/null, Wholesale/Electronics/null, Wholesale/Apparel/null
        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe",
            "Online", "Online", "Retail", "Retail", "Wholesale", "Wholesale"],
          [null, "UK", "Germany",
            "Electronics", "Apparel", "Electronics", "Apparel", "Electronics", "Apparel"],
          [null, null, null, null, null, null, null, null, null],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, 1, 9).data).to.deep.equal([
          [9820, 3350, 4030, 9150, 1230, 3900, 1680, 750, 490],
        ]);
      });
    });

    describe("Cross hierarchy+concat multi-branch drilldown", () => {
      const crossHierConcatRows = cross(
        hierarchy("region", "country", "city"),
        concat(hierarchy("department", "product"), "channel"),
      );

      it("multi-branch — NA deep to city+product, Europe shallow to country", async () => {
        const model = await makeModel();
        const vm = await model.getViewModelData({
          rows: {
            expr: crossHierConcatRows,
            projection: [
              { open: ["North America"], next: { open: ["USA"], next: { open: "*", next: { open: ["Electronics"] } } } },
              { open: ["Europe"] },
            ],
          },
          columns: "revenue",
        });

        // Path 1: NA → USA → all cities → Electronics (reveals product)
        //   hierarchy(region,country,city) segments:
        //     seg1: groupBy[region,country,city] WHERE region IN (NA,Europe) AND country IN (USA)
        //       → NA/USA/New York, NA/USA/Chicago
        //     seg2: groupBy[region,country] WHERE region IN (NA,Europe) AND country NOT IN (USA)
        //       → NA/Canada, Europe/UK, Europe/Germany
        //   concat(hierarchy(dept,product),channel) receives [{ open: ["Electronics"] }]:
        //     hierarchy(dept,product) segments:
        //       seg1: groupBy[dept,product] WHERE dept IN (Electronics)
        //         → Electronics/Laptop, Electronics/Phone
        //       seg2: groupBy[dept] WHERE dept NOT IN (Electronics)
        //         → Apparel/null
        //     channel: Online, Retail, Wholesale
        //
        // Path 2: Europe → countries only (no city, no child1)
        //
        // Cross gating: child0 selective → only NA/USA rows get cross-joined with child1
        //   seg1: both children visible WHERE region IN (NA,Europe) AND country IN (USA)
        //   seg2: child0 only, child1 null WHERE NOT(region IN (NA,Europe) AND country IN (USA))
        //
        // Rows (15 total):
        //   New York × (Elec/Laptop, Elec/Phone, Apparel, Online, Retail, Wholesale)
        //   Chicago  × (Elec/Laptop, Elec/Phone, Apparel, Online, Retail, Wholesale)
        //   Canada/null, UK/null, Germany/null
        expect(vm.rowFacets).to.deep.equal([
          [
            "North America", "North America", "North America", "North America", "North America", "North America",
            "North America", "North America", "North America", "North America", "North America", "North America",
            "North America", "Europe", "Europe",
          ],
          [
            "USA", "USA", "USA", "USA", "USA", "USA",
            "USA", "USA", "USA", "USA", "USA", "USA",
            "Canada", "UK", "Germany",
          ],
          [
            "New York", "New York", "New York", "New York", "New York", "New York",
            "Chicago", "Chicago", "Chicago", "Chicago", "Chicago", "Chicago",
            null, null, null,
          ],
          [
            "Electronics", "Electronics", "Apparel", "Online", "Retail", "Wholesale",
            "Electronics", "Electronics", "Apparel", "Online", "Retail", "Wholesale",
            null, null, null,
          ],
          [
            "Laptop", "Phone", null, null, null, null,
            "Laptop", "Phone", null, null, null, null,
            null, null, null,
          ],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, 1, 15).data).to.deep.equal([
          [
            2700, 1750, 650, 3950, 1150, null,
            1100, 900, 540, 1350, 900, 290,
            2180, 3350, 4030,
          ],
        ]);
      });
    });

    // ── Progressive multi-path hierarchy drilldown ──────────────────────
    // hierarchy("region","country","city"), columns="revenue"
    //
    // Verifies per-value subtree splitting: different parent values can have
    // independent expansion depths. The old flat-merge algorithm would merge
    // wildcards globally, incorrectly expanding all subtrees.
    describe("Progressive multi-path hierarchy drilldown", () => {

      // Step 1: Europe expanded to city level, NA collapsed
      // paths: [{ open: ["Europe"], next: { open: "*" } }]
      //   Europe wildcard at country → all Europe cities visible
      //   NA not opened → region only
      //
      // Europe/Germany/Berlin: 1300+750+350+280+1350 = 4030
      // Europe/UK/London: 1400+850+400+320+380 = 3350
      // North America/null/null: 9820
      it("step — Europe cities expanded, NA collapsed", async () => {
        const model = await makeModel();
        const vm = await model.getViewModelData({
          rows: { expr: hierarchy("region", "country", "city"), projection: [{ open: ["Europe"], next: { open: "*" } }] },
          columns: "revenue",
        });

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe"],
          [null, "UK", "Germany"],
          [null, "London", "Berlin"],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, 1, 3).data).to.deep.equal([
          [9820, 3350, 4030],
        ]);
      });

      // Step 2: Adding a subset path for Europe/Germany — should not change result
      // since path 1 already wildcards all Europe countries
      // paths: [{ open: ["Europe"], next: { open: "*" } }, { open: ["Europe"], next: { open: ["Germany"] } }]
      it("step — subset path absorbed by wildcard", async () => {
        const model = await makeModel();
        const vm = await model.getViewModelData({
          rows: {
            expr: hierarchy("region", "country", "city"),
            projection: [
              { open: ["Europe"], next: { open: "*" } },
              { open: ["Europe"], next: { open: ["Germany"] } },
            ],
          },
          columns: "revenue",
        });

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "Europe", "Europe"],
          [null, "UK", "Germany"],
          [null, "London", "Berlin"],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, 1, 3).data).to.deep.equal([
          [9820, 3350, 4030],
        ]);
      });

      // Step 3: Add NA path that selectively expands USA to city level
      // paths: [
      //   { open: ["Europe"], next: { open: "*" } },
      //   { open: ["Europe"], next: { open: ["Germany"] } },
      //   { open: ["North America"], next: { open: ["USA"], next: { open: "*" } } }
      // ]
      //
      // Europe: all cities (wildcard at country level)
      //   Europe/Germany/Berlin: 4030
      //   Europe/UK/London: 3350
      // NA/USA: all cities (wildcard at city level for USA)
      //   NA/USA/Chicago: 1100+900+250+290 = 2540
      //   NA/USA/New York: 1200+1500+800+300+350+950 = 5100
      // NA/Canada: country visible but no city (not expanded)
      //   NA/Canada/null: 1000+700+280+200 = 2180
      it("step — per-value subtree splitting", async () => {
        const model = await makeModel();
        const vm = await model.getViewModelData({
          rows: {
            expr: hierarchy("region", "country", "city"),
            projection: [
              { open: ["Europe"], next: { open: "*" } },
              { open: ["Europe"], next: { open: ["Germany"] } },
              { open: ["North America"], next: { open: ["USA"], next: { open: "*" } } },
            ],
          },
          columns: "revenue",
        });

        expect(vm.rowFacets).to.deep.equal([
          ["North America", "North America", "North America", "Europe", "Europe"],
          ["USA", "USA", "Canada", "UK", "Germany"],
          ["New York", "Chicago", null, "London", "Berlin"],
        ]);
        expect(vm.columnFacets).to.deep.equal([["revenue"]]);
        expect(vm.getSlice(0, 0, 1, 5).data).to.deep.equal([
          [5100, 2540, 2180, 3350, 4030],
        ]);
      });
    });

    // ── 4-level hierarchy progressive drilldown ─────────────────────────
    // hierarchy("region","country","city","department")
    //
    // Demonstrates that opening a value reveals all its children (siblings
    // can't be excluded), and each subtree expands independently.
    it("4-level hierarchy progressive drilldown", async () => {
      const model = await makeModel();
      const hier4 = hierarchy("region", "country", "city", "department");

      // Base: region only
      const vm0 = await model.getViewModelData({
        rows: { expr: hier4, projection: [] },
        columns: "revenue",
      });
      expect(vm0.rowFacets).to.deep.equal([
        ["North America", "Europe"],
        [null, null],
        [null, null],
        [null, null],
      ]);

      // Open Europe → all Europe countries visible
      const vm1 = await model.getViewModelData({
        rows: { expr: hier4, projection: [{ open: ["Europe"] }] },
        columns: "revenue",
      });
      expect(vm1.rowFacets).to.deep.equal([
        ["North America", "Europe", "Europe"],
        [null, "UK", "Germany"],
        [null, null, null],
        [null, null, null],
      ]);

      // Open Europe countries → all Europe cities visible
      const vm2 = await model.getViewModelData({
        rows: { expr: hier4, projection: [{ open: ["Europe"], next: { open: "*" } }] },
        columns: "revenue",
      });
      expect(vm2.rowFacets).to.deep.equal([
        ["North America", "Europe", "Europe"],
        [null, "UK", "Germany"],
        [null, "London", "Berlin"],
        [null, null, null],
      ]);

      // Also open NA, expand only USA to city
      const vm3 = await model.getViewModelData({
        rows: {
          expr: hier4,
          projection: [
            { open: ["Europe"], next: { open: "*" } },
            { open: ["North America"], next: { open: ["USA"] } },
          ],
        },
        columns: "revenue",
      });
      expect(vm3.rowFacets).to.deep.equal([
        ["North America", "North America", "North America", "Europe", "Europe"],
        ["USA", "USA", "Canada", "UK", "Germany"],
        ["New York", "Chicago", null, "London", "Berlin"],
        [null, null, null, null, null],
      ]);

      // Expand New York to department — Chicago and Canada stay collapsed
      const vm4 = await model.getViewModelData({
        rows: {
          expr: hier4,
          projection: [
            { open: ["Europe"], next: { open: "*" } },
            { open: ["North America"], next: { open: ["USA"], next: { open: ["New York"] } } },
          ],
        },
        columns: "revenue",
      });
      expect(vm4.rowFacets).to.deep.equal([
        ["North America", "North America", "North America", "North America", "Europe", "Europe"],
        ["USA", "USA", "USA", "Canada", "UK", "Germany"],
        ["New York", "New York", "Chicago", null, "London", "Berlin"],
        ["Electronics", "Apparel", null, null, null, null],
      ]);
    });

    // ── Cross two hierarchies progressive drilldown ─────────────────────
    // cross(hierarchy("region","country","city"), hierarchy("department","product"))
    //
    // Levels: region=L0, country=L1, city=L2 (child 0), department=L3, product=L4 (child 1)
    // Paths flow left-to-right: child 1 only becomes visible once paths traverse child 0's full range.
    it("cross(hier,hier) progressive drilldown with selective values", async () => {
      const model = await makeModel();
      const crossHH = cross(hierarchy("region", "country", "city"), hierarchy("department", "product"));

      // Step 0: base state — region only, child 1 invisible
      const vm0 = await model.getViewModelData({
        rows: { expr: crossHH, projection: [] },
        columns: "revenue",
      });
      expect(vm0.rowFacets).to.deep.equal([
        ["North America", "Europe"],
        [null, null],
        [null, null],
        [null, null],
        [null, null],
      ]);

      // Step 1: open Europe → Europe countries visible, NA collapsed
      const vm1 = await model.getViewModelData({
        rows: { expr: crossHH, projection: [{ open: ["Europe"] }] },
        columns: "revenue",
      });
      expect(vm1.rowFacets).to.deep.equal([
        ["North America", "Europe", "Europe"],
        [null, "UK", "Germany"],
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ]);

      // Step 2: open UK → Europe/UK cities visible, Europe/Germany stays at country, NA collapsed
      const vm2 = await model.getViewModelData({
        rows: { expr: crossHH, projection: [{ open: ["Europe"], next: { open: ["UK"] } }] },
        columns: "revenue",
      });
      expect(vm2.rowFacets).to.deep.equal([
        ["North America", "Europe", "Europe"],
        [null, "UK", "Germany"],
        [null, "London", null],
        [null, null, null],
        [null, null, null],
      ]);

      // Step 3: open London → paths traverse child 0's full range for Europe/UK/London.
      // Cross gating: EU/UK/London rows see child 1 (department base state), others don't.
      // Note: UK only has London in the data, so the city NOT IN (London) segment is empty.
      const vm3 = await model.getViewModelData({
        rows: { expr: crossHH, projection: [{ open: ["Europe"], next: { open: ["UK"], next: { open: ["London"] } } }] },
        columns: "revenue",
      });
      expect(vm3.rowFacets).to.deep.equal([
        ["North America", "Europe", "Europe", "Europe"],
        [null, "UK", "UK", "Germany"],
        [null, "London", "London", null],
        [null, "Electronics", "Apparel", null],
        [null, null, null, null],
      ]);

      // Step 4: two paths — Europe drills into child 1 (Electronics→product),
      // NA opens all countries (wildcard) then selectively opens New York to reach child 0's edge.
      //
      // Path 2 uses open:"*" at country level, so all NA countries are visible with cities.
      // Only New York reaches child 0's edge → cross gating lets London and New York see child 1.
      // Chicago, Toronto, Germany see only child 0.
      //
      // NA/USA/New York × Elec/Laptop:   rows 0,1 → 2700
      // NA/USA/New York × Elec/Phone:    rows 2,20 → 1750
      // NA/USA/New York × Apparel/null:  rows 3,4 → 650
      // NA/USA/Chicago/null/null:        rows 5,6,7,22 → 2540
      // NA/Canada/Toronto/null/null:     rows 8,9,10,11 → 2180
      // EU/UK/London × Elec/Laptop:      row 12 → 1400
      // EU/UK/London × Elec/Phone:       row 13 → 850
      // EU/UK/London × Apparel/null:     rows 14,15,21 → 1100
      // EU/Germany/null/null/null:       rows 16,17,18,19,23 → 4030
      const vm4 = await model.getViewModelData({
        rows: {
          expr: crossHH,
          projection: [
            { open: ["Europe"], next: { open: ["UK"], next: { open: ["London"], next: { open: ["Electronics"] } } } },
            { open: ["North America"], next: { open: "*", next: { open: ["New York"] } } },
          ],
        },
        columns: "revenue",
      });
      expect(vm4.rowFacets).to.deep.equal([
        ["North America", "North America", "North America", "North America", "North America",
          "Europe", "Europe", "Europe", "Europe"],
        ["USA", "USA", "USA", "USA", "Canada",
          "UK", "UK", "UK", "Germany"],
        ["New York", "New York", "New York", "Chicago", "Toronto",
          "London", "London", "London", null],
        ["Electronics", "Electronics", "Apparel", null, null,
          "Electronics", "Electronics", "Apparel", null],
        ["Laptop", "Phone", null, null, null,
          "Laptop", "Phone", null, null],
      ]);
      expect(vm4.columnFacets).to.deep.equal([["revenue"]]);
      expect(vm4.getSlice(0, 0, 1, 9).data).to.deep.equal([
        [2700, 1750, 650, 2540, 2180, 1400, 850, 1100, 4030],
      ]);
    });

    it("cross(hier,hier,hier) multi-child gating", async () => {
      const model = await makeModel();
      // 3-child cross: child 0 = hierarchy(region,country), child 1 = hierarchy(department,product), child 2 = simple(channel)
      const crossHHH = cross(hierarchy("region", "country"), hierarchy("department", "product"), "channel");

      // Drilldown: Europe → UK → Electronics → Laptop → Online
      // Paths traverse all 3 children. Each child has selective values → each is a gating boundary.
      //
      // Child 0: hierarchy(region,country) with open Europe → UK
      //   Segments: EU/UK | EU/Germany | NA
      //
      // Child 1: hierarchy(dept,product) with open Electronics → Laptop
      //   Segments: Elec/Laptop | Elec/Phone | Apparel(dept only)
      //
      // Child 2: simple(channel) — fully expanded (Online, Retail, Wholesale)
      //
      // Expected 3 tiers of gating:
      //   Tier 1: EU/UK × Elec/Laptop × channel (all 3 children)
      //   Tier 2: EU/UK × {Elec/Phone, Apparel} (child 0 × child 1, no child 2)
      //   Tier 3: {EU/Germany, NA} (child 0 only)
      //
      // 7 rows total:
      //   NA         | null    | null        | null   | null
      //   EU/UK      | Elec   | Laptop      | Online
      //   EU/UK      | Elec   | Laptop      | Retail
      //   EU/UK      | Elec   | Laptop      | Wholesale
      //   EU/UK      | Elec   | Phone       | null
      //   EU/UK      | Apparel| null        | null
      //   EU/Germany | null   | null        | null   | null
      const vm = await model.getViewModelData({
        rows: {
          expr: crossHHH,
          projection: [
            { open: ["Europe"], next: { open: ["UK"], next: { open: ["Electronics"], next: { open: ["Laptop"], next: { open: ["Online"] } } } } },
          ],
        },
        columns: "revenue",
      });

      expect(vm.rowFacets).to.deep.equal([
        ["North America", "Europe", "Europe", "Europe", "Europe", "Europe", "Europe"],
        [null, "UK", "UK", "UK", "UK", "UK", "Germany"],
        [null, "Electronics", "Electronics", "Electronics", "Electronics", "Apparel", null],
        [null, "Laptop", "Laptop", "Laptop", "Phone", null, null],
        [null, "Online", "Retail", "Wholesale", null, null, null],
      ]);
    });
  });
});
