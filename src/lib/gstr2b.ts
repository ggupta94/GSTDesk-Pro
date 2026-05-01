// Parser for the official GSTR-2B JSON file downloaded from gst.gov.in.
//
// Real-world structure (current GSTN format):
// {
//   "data": {
//     "gstin": "...",
//     "rtnprd": "MMYYYY",            // e.g. "042024" -> April 2024
//     "itcsum": {
//       "itcavl":  [{ ty, iamt, camt, samt, csamt }, ...],   // available
//       "itcblked":[{ ty, iamt, camt, samt, csamt }, ...],   // blocked (Rule 38 etc.)
//       "itcrev":  [{ ty, iamt, camt, samt, csamt }, ...],   // reversal
//       "itcngav": [{ ty, iamt, camt, samt, csamt }, ...]    // not available
//     }
//   }
// }
//
// We parse defensively because the GSTN format has shifted over the years
// (some files wrap as `{ data: {...} }`, others put it at the top level).

type ItcSumRow = {
  ty?: string;
  iamt?: number;
  camt?: number;
  samt?: number;
  csamt?: number;
};

export type Gstr2bParseResult =
  | {
      ok: true;
      gstin: string;
      period: string; // YYYY-MM
      periodLabel: string; // "Apr 2024"
      igstAvailable: number;
      cgstAvailable: number;
      sgstAvailable: number;
      cessAvailable: number;
      igstBlocked: number;
      cgstBlocked: number;
      sgstBlocked: number;
      eligibility: "FULLY_ELIGIBLE" | "PARTIALLY_BLOCKED" | "BLOCKED";
      blockedReason: string;
      counts: { available: number; blocked: number; reversed: number; notAvailable: number };
    }
  | { ok: false; error: string };

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function pickRoot(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.data && typeof r.data === "object") return r.data as Record<string, unknown>;
  return r;
}

function sumRows(rows: unknown): { iamt: number; camt: number; samt: number; csamt: number } {
  if (!Array.isArray(rows)) return { iamt: 0, camt: 0, samt: 0, csamt: 0 };
  const acc = { iamt: 0, camt: 0, samt: 0, csamt: 0 };
  for (const r of rows as ItcSumRow[]) {
    acc.iamt += Number(r.iamt) || 0;
    acc.camt += Number(r.camt) || 0;
    acc.samt += Number(r.samt) || 0;
    acc.csamt += Number(r.csamt) || 0;
  }
  return acc;
}

export function parseGstr2bJson(raw: unknown): Gstr2bParseResult {
  const root = pickRoot(raw);
  if (!root) return { ok: false, error: "Not a JSON object." };

  const gstin = String(root.gstin ?? "").toUpperCase();
  if (gstin.length !== 15) {
    return { ok: false, error: "JSON has no valid 'gstin' field — is this really a GSTR-2B export?" };
  }

  // rtnprd format is "MMYYYY" e.g. "042024"
  const rtnprdRaw = String(root.rtnprd ?? root.retPeriod ?? "");
  if (!/^\d{6}$/.test(rtnprdRaw)) {
    return { ok: false, error: `Couldn't parse return period from rtnprd="${rtnprdRaw}".` };
  }
  const mm = rtnprdRaw.slice(0, 2);
  const yyyy = rtnprdRaw.slice(2);
  const period = `${yyyy}-${mm}`;
  const periodLabel = `${MONTH_NAMES[parseInt(mm, 10) - 1] ?? mm} ${yyyy}`;

  const itcsum = (root.itcsum ?? {}) as Record<string, unknown>;
  const avl = sumRows(itcsum.itcavl);
  const blkd = sumRows(itcsum.itcblked);
  const rev = sumRows(itcsum.itcrev);
  const nav = sumRows(itcsum.itcngav);

  const eligibility: "FULLY_ELIGIBLE" | "PARTIALLY_BLOCKED" | "BLOCKED" =
    blkd.iamt + blkd.camt + blkd.samt > 0
      ? avl.iamt + avl.camt + avl.samt > 0
        ? "PARTIALLY_BLOCKED"
        : "BLOCKED"
      : "FULLY_ELIGIBLE";

  const blockedReasonParts: string[] = [];
  if (blkd.iamt + blkd.camt + blkd.samt > 0) {
    blockedReasonParts.push(
      `Blocked per 2B: ₹ ${(blkd.iamt + blkd.camt + blkd.samt).toFixed(0)}`
    );
  }
  if (rev.iamt + rev.camt + rev.samt > 0) {
    blockedReasonParts.push(
      `Reversal per 2B: ₹ ${(rev.iamt + rev.camt + rev.samt).toFixed(0)}`
    );
  }

  const counts = {
    available: Array.isArray(itcsum.itcavl) ? (itcsum.itcavl as unknown[]).length : 0,
    blocked: Array.isArray(itcsum.itcblked) ? (itcsum.itcblked as unknown[]).length : 0,
    reversed: Array.isArray(itcsum.itcrev) ? (itcsum.itcrev as unknown[]).length : 0,
    notAvailable: Array.isArray(itcsum.itcngav) ? (itcsum.itcngav as unknown[]).length : 0,
  };

  return {
    ok: true,
    gstin,
    period,
    periodLabel,
    igstAvailable: round2(avl.iamt),
    cgstAvailable: round2(avl.camt),
    sgstAvailable: round2(avl.samt),
    cessAvailable: round2(avl.csamt),
    igstBlocked: round2(blkd.iamt),
    cgstBlocked: round2(blkd.camt),
    sgstBlocked: round2(blkd.samt),
    eligibility,
    blockedReason: blockedReasonParts.join(" · "),
    counts,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
