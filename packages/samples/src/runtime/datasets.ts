import rawPayroll from "../../datasets/Citywide_Payroll_Data_20260306_random_sample_500.json";
import type { SampleRow, SampleValue } from "../types";

// Raw source rows: every field is a string (currency like "$107,789.00",
// integers like "260", dates like "09/01/2012"), and some may be missing/empty.
type RawRow = Record<string, string | null | undefined>;

function isBlank(value: string | null | undefined): value is null | undefined | "" {
  return value == null || value === "";
}

// "$107,789.00" -> 107789, "$0.00" -> 0. Blank/undefined pass through unchanged.
function parseCurrency(value: string | null | undefined): SampleValue {
  if (isBlank(value)) return value;
  return Number(value.replace(/[$,]/g, ""));
}

// "260" -> 260. Blank/undefined pass through unchanged.
function parseIntField(value: string | null | undefined): SampleValue {
  if (isBlank(value)) return value;
  return parseInt(value, 10);
}

// "09/01/2012" (MM/DD/YYYY) -> unix timestamp in seconds. Blank passes through.
function parseUnixTs(value: string | null | undefined): SampleValue {
  if (isBlank(value)) return value;
  return Math.round(new Date(value).getTime() / 1000);
}

function transformRow(row: RawRow): SampleRow {
  return {
    ...row,
    fiscal_year: parseIntField(row.fiscal_year),
    payroll_number: parseIntField(row.payroll_number),
    agency_start_date: parseUnixTs(row.agency_start_date),
    base_salary: parseCurrency(row.base_salary),
    regular_hours: parseIntField(row.regular_hours),
    regular_gross_paid: parseCurrency(row.regular_gross_paid),
    ot_hours: parseIntField(row.ot_hours),
    total_ot_paid: parseCurrency(row.total_ot_paid),
    total_other_pay: parseCurrency(row.total_other_pay),
  };
}

// Transform once at module load and keep the cleaned rows in memory.
const payroll: SampleRow[] = (rawPayroll as RawRow[]).map(transformRow);

const datasets: Record<string, SampleRow[]> = {
  payroll,
};

// Human-readable header names keyed by data field.
export const headers: Record<string, string> = {
  fiscal_year: "Fiscal Year",
  payroll_number: "Payroll Number",
  agency_name: "Agency",
  last_name: "Last Name",
  first_name: "First Name",
  mid_init: "Middle Initial",
  agency_start_date: "Agency Start Date",
  work_location_borough: "Borough",
  title_description: "Title",
  leave_status_as_of_june_30: "Leave Status",
  base_salary: "Base Salary",
  pay_basis: "Pay Basis",
  regular_hours: "Regular Hours",
  regular_gross_paid: "Regular Gross Paid",
  ot_hours: "OT Hours",
  total_ot_paid: "Total OT Paid",
  total_other_pay: "Total Other Pay",
};

export async function loadDataset(name: string): Promise<SampleRow[]> {
  return datasets[name];
}
