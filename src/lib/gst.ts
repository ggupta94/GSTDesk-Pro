import { addDays, addMonths, endOfMonth, format, lastDayOfMonth, parse } from "date-fns";
import type { ReturnType, FilingFrequency } from "./constants";

// ─── GST CALCULATOR ────────────────────────────────────────────
export type GstSplit = {
  base: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export function splitGst(
  amount: number,
  rate: number,
  inclusive: boolean,
  intraState: boolean
): GstSplit {
  if (!isFinite(amount) || amount < 0) amount = 0;
  if (!isFinite(rate) || rate < 0) rate = 0;
  const base = inclusive ? amount / (1 + rate / 100) : amount;
  const taxTotal = base * (rate / 100);
  const split: GstSplit = {
    base: round2(base),
    cgst: 0,
    sgst: 0,
    igst: 0,
    total: round2(inclusive ? amount : amount + taxTotal),
  };
  if (intraState) {
    split.cgst = round2(taxTotal / 2);
    split.sgst = round2(taxTotal / 2);
  } else {
    split.igst = round2(taxTotal);
  }
  return split;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── DUE DATE CALCULATOR ───────────────────────────────────────
// Standard GST due dates (commonly used; will need overrides for govt extensions):
//  GSTR-1 monthly: 11th of next month
//  GSTR-1 quarterly (QRMP): 13th of month following the quarter
//  GSTR-3B monthly: 20th of next month
//  GSTR-3B quarterly: 22nd or 24th of month following the quarter (state-based; using 22nd here)
//  GSTR-9 (annual): 31 Dec following FY end
//  GSTR-2B: auto-generated 14th of next month (read-only)
export function calculateDueDate(
  type: ReturnType,
  period: string,
  frequency: FilingFrequency = "MONTHLY"
): Date {
  if (type === "GSTR9") {
    // period e.g. "FY2025-26" -> due 31 Dec 2026
    const m = period.match(/FY(\d{4})-(\d{2,4})/);
    if (!m) return new Date();
    const endYearShort = m[2];
    const endYear =
      endYearShort.length === 4 ? parseInt(endYearShort, 10) : 2000 + parseInt(endYearShort, 10);
    return new Date(endYear, 11, 31);
  }

  // monthly period like "2026-04"
  if (frequency === "MONTHLY" || type === "GSTR2B") {
    const periodDate = parse(period, "yyyy-MM", new Date());
    const nextMonth = addMonths(periodDate, 1);
    let day = 20;
    if (type === "GSTR1") day = 11;
    else if (type === "GSTR3B") day = 20;
    else if (type === "GSTR2B") day = 14;
    return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day);
  }

  // quarterly period like "2026-Q1"
  const qm = period.match(/(\d{4})-Q([1-4])/);
  if (!qm) return new Date();
  const year = parseInt(qm[1], 10);
  const q = parseInt(qm[2], 10);
  const quarterEndMonth = q * 3 - 1; // Q1=Mar->idx 2 (since Q1=Apr-Jun in GST FY)? we treat civil quarters here
  // For GST QRMP, Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
  // Map: Q1->Jun(idx 5), Q2->Sep(idx 8), Q3->Dec(idx 11), Q4->Mar(idx 2)
  const lastMonthByQ: Record<number, number> = { 1: 5, 2: 8, 3: 11, 4: 2 };
  const lastMonth = lastMonthByQ[q];
  const lastMonthYear = q === 4 ? year + 1 : year;
  const filingMonth = addMonths(new Date(lastMonthYear, lastMonth, 1), 1);
  const day = type === "GSTR1" ? 13 : 22;
  return new Date(filingMonth.getFullYear(), filingMonth.getMonth(), day);
}

// ─── PERIOD HELPERS ────────────────────────────────────────────
export function currentMonthlyPeriod(d: Date = new Date()): string {
  // Filing for previous month, but show current period selector default = previous month
  const prev = addMonths(d, -1);
  return format(prev, "yyyy-MM");
}

export function formatPeriodLabel(period: string): string {
  if (period.startsWith("FY")) return period;
  if (/Q[1-4]/.test(period)) return period;
  try {
    return format(parse(period, "yyyy-MM", new Date()), "MMM yyyy");
  } catch {
    return period;
  }
}

export function listRecentMonthlyPeriods(count = 12): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = addMonths(now, -i);
    const value = format(d, "yyyy-MM");
    out.push({ value, label: format(d, "MMM yyyy") });
  }
  return out;
}

// ─── RETURN STATUS DERIVATION ──────────────────────────────────
export function deriveStatus(filedAt: Date | null | undefined, dueDate: Date): "PENDING" | "FILED" | "OVERDUE" {
  if (filedAt) return "FILED";
  if (new Date() > dueDate) return "OVERDUE";
  return "PENDING";
}
