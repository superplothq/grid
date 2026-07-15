import type { DataSchema } from "grid/dist/index";

// A self-contained SaaS-subscriptions dataset: five dimensions (region ▸ country
// form a natural drill-down hierarchy, plus plan, industry, and acquisition
// channel) and four additive measures. Generated deterministically so the pivot
// renders identically on every load.

export interface Field {
  name: string;
  label: string;
  kind: "dimension" | "measure";
}

export const FIELDS: Field[] = [
  { name: "region", label: "Region", kind: "dimension" },
  { name: "country", label: "Country", kind: "dimension" },
  { name: "plan", label: "Plan", kind: "dimension" },
  { name: "industry", label: "Industry", kind: "dimension" },
  { name: "channel", label: "Channel", kind: "dimension" },
  { name: "mrr", label: "MRR", kind: "measure" },
  { name: "seats", label: "Seats", kind: "measure" },
  { name: "signups", label: "Signups", kind: "measure" },
  { name: "churned", label: "Churned Seats", kind: "measure" },
];

export const DIMENSION_NAMES = FIELDS.filter(f => f.kind === "dimension").map(f => f.name);
export const MEASURE_NAMES = FIELDS.filter(f => f.kind === "measure").map(f => f.name);

export const SCHEMA: DataSchema[] = [
  { name: "region", displayName: "Region", type: "dimension", cardinality: "low" },
  { name: "country", displayName: "Country", type: "dimension", cardinality: "low" },
  { name: "plan", displayName: "Plan", type: "dimension", cardinality: "low" },
  { name: "industry", displayName: "Industry", type: "dimension", cardinality: "low" },
  { name: "channel", displayName: "Channel", type: "dimension", cardinality: "low" },
  { name: "mrr", displayName: "MRR", type: "measure", subtype: "decimal", aggregateFn: "sum" },
  { name: "seats", displayName: "Seats", type: "measure", subtype: "integer", aggregateFn: "sum" },
  { name: "signups", displayName: "Signups", type: "measure", subtype: "integer", aggregateFn: "sum" },
  { name: "churned", displayName: "Churned Seats", type: "measure", subtype: "integer", aggregateFn: "sum" },
];

const ROW_COUNT = 5000;

const GEO: { region: string; countries: string[]; mult: number }[] = [
  { region: "North America", countries: ["United States", "Canada"], mult: 1.25 },
  { region: "Europe", countries: ["United Kingdom", "Germany", "France"], mult: 1.05 },
  { region: "APAC", countries: ["India", "Japan", "Australia"], mult: 0.85 },
  { region: "LATAM", countries: ["Brazil", "Mexico"], mult: 0.7 },
];

interface PlanSpec {
  name: string;
  weight: number;
  seatMin: number;
  seatMax: number;
  mrrPerSeat: number;
  churnRate: number;
}

const PLANS: PlanSpec[] = [
  { name: "Free", weight: 34, seatMin: 1, seatMax: 6, mrrPerSeat: 0, churnRate: 0.22 },
  { name: "Pro", weight: 32, seatMin: 3, seatMax: 28, mrrPerSeat: 26, churnRate: 0.11 },
  { name: "Business", weight: 22, seatMin: 20, seatMax: 140, mrrPerSeat: 48, churnRate: 0.07 },
  { name: "Enterprise", weight: 12, seatMin: 90, seatMax: 820, mrrPerSeat: 82, churnRate: 0.04 },
];

const INDUSTRIES: { name: string; mult: number }[] = [
  { name: "Technology", mult: 1.1 },
  { name: "Finance", mult: 1.35 },
  { name: "Healthcare", mult: 1.2 },
  { name: "Retail", mult: 0.9 },
  { name: "Education", mult: 0.72 },
];

const CHANNELS = ["Organic", "Paid Search", "Referral", "Partner", "Outbound"];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T extends { weight: number }>(rand: () => number, items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rand() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}

function intBetween(rand: () => number, lo: number, hi: number): number {
  return Math.floor(lo + rand() * (hi - lo + 1));
}

export interface Dataset {
  schema: DataSchema[];
  // Column-major: data[fieldIndex] holds every row's value for that field.
  data: unknown[][];
}

// Distinct dimension values in a stable order, used to build the fully-expanded
// projection tree without a round-trip to DuckDB.
export const DIM_VALUES: Record<string, string[]> = {
  region: GEO.map(g => g.region),
  country: GEO.flatMap(g => g.countries),
  plan: PLANS.map(p => p.name),
  industry: INDUSTRIES.map(i => i.name),
  channel: CHANNELS,
};

export function generateDataset(): Dataset {
  const rand = mulberry32(0x5a17ba5e);

  const region: string[] = [];
  const country: string[] = [];
  const plan: string[] = [];
  const industry: string[] = [];
  const channel: string[] = [];
  const mrr: number[] = [];
  const seats: number[] = [];
  const signups: number[] = [];
  const churned: number[] = [];

  for (let i = 0; i < ROW_COUNT; i++) {
    const geo = pick(rand, GEO);
    const ctry = pick(rand, geo.countries);
    const planSpec = pickWeighted(rand, PLANS);
    const ind = pick(rand, INDUSTRIES);
    const chn = pick(rand, CHANNELS);

    const seatCount = intBetween(rand, planSpec.seatMin, planSpec.seatMax);
    const perSeat = planSpec.mrrPerSeat * ind.mult * geo.mult * (0.85 + rand() * 0.3);
    const revenue = Math.round(seatCount * perSeat);
    const newSignups = seatCount + intBetween(rand, 0, Math.ceil(seatCount * 0.4));
    const churnedSeats = Math.round(seatCount * planSpec.churnRate * (0.6 + rand() * 0.8));

    region.push(geo.region);
    country.push(ctry);
    plan.push(planSpec.name);
    industry.push(ind.name);
    channel.push(chn);
    mrr.push(revenue);
    seats.push(seatCount);
    signups.push(newSignups);
    churned.push(Math.min(churnedSeats, seatCount));
  }

  return {
    schema: SCHEMA,
    data: [region, country, plan, industry, channel, mrr, seats, signups, churned],
  };
}
