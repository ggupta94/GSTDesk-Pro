// Parser for the official GSTR-2B JSON file downloaded from gst.gov.in.
//
// The GSTN format has shifted multiple times over the years — older files use
// `itcsum.itcavl[]` arrays, newer ones use `itcsmry.{b2b,impg,...}` objects,
// and some downloads put the summary inline alongside docdata. Rather than
// hard-code a single shape, we WALK THE ENTIRE TREE and collect every
// (iamt, camt, samt, csamt) quartet, classifying each by the property path:
//
//   path contains "blk" / "blocked" / "ngav" / "ineli"  → BLOCKED bucket
//   path contains "rev" / "reversed"                    → REVERSED bucket
//   path starts with / contains "docdata" or "docs"     → SKIP (invoice-level
//                                                          details, would
//                                                          double-count)
//   anything else                                       → AVAILABLE bucket
//
// This handles every variant we've seen and degrades gracefully on shapes
// we haven't.

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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
      summaryRoots: string[]; // top-level keys we recognised — for debugging
      diagnostic: string;
    }
  | { ok: false; error: string; diagnostic?: string };

type Bucket = { iamt: number; camt: number; samt: number; csamt: number };
const ZERO: Bucket = { iamt: 0, camt: 0, samt: 0, csamt: 0 };

function bucketFromObj(o: Record<string, unknown>): Bucket | null {
  // Recognise an "ITC quartet" object: at least one of iamt/camt/samt/csamt.
  // Some files use IAMT/CAMT/SAMT/CSAMT, some use ig_amt etc. — try both.
  const get = (...keys: string[]): number => {
    for (const k of keys) {
      if (k in o) {
        const v = o[k];
        if (typeof v === "number" && isFinite(v)) return v;
        if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v);
      }
    }
    return 0;
  };
  const iamt = get("iamt", "IAMT", "igst", "igst_amt", "ig_amt");
  const camt = get("camt", "CAMT", "cgst", "cgst_amt", "cg_amt");
  const samt = get("samt", "SAMT", "sgst", "sgst_amt", "sg_amt");
  const csamt = get("csamt", "CSAMT", "cess", "cess_amt", "cs_amt");
  if (iamt === 0 && camt === 0 && samt === 0 && csamt === 0) {
    // Either not a quartet, or just zeros; we still want to count zeros if the
    // object looks like an ITC quartet (i.e., has at least one of the keys).
    const hasAny =
      "iamt" in o || "IAMT" in o || "camt" in o || "CAMT" in o ||
      "samt" in o || "SAMT" in o || "csamt" in o || "CSAMT" in o ||
      "igst" in o || "cgst" in o || "sgst" in o;
    if (!hasAny) return null;
  }
  return { iamt, camt, samt, csamt };
}

function classify(path: string): "skip" | "blocked" | "reversed" | "available" {
  const p = path.toLowerCase();
  // skip docdata sections — they contain per-invoice rows that, when summed,
  // would equal the summary section and cause double-counting.
  if (/(^|\.)docdata(\.|$)/.test(p)) return "skip";
  if (/(^|\.)doc(\.|$)/.test(p)) return "skip";
  if (/(^|\.)docs(\.|$)/.test(p)) return "skip";
  if (/(^|\.)b2bcdn|cdn|b2bcdnr|b2bcdnra/.test(p) === false) {
    // not all gstn files use docdata wrapper; we still want to count category-level rows
  }
  // Some files put each invoice as a row at e.g. itcsmry.b2b[0].inv[0].itms[0]
  // Detect that — if path contains "inv" or "itms" or "items", skip per-line items.
  if (/(^|\.)itms(\.|$)/.test(p)) return "skip";
  if (/(^|\.)items(\.|$)/.test(p)) return "skip";
  if (/(^|\.)inv(\.|$)/.test(p)) return "skip";
  if (/(^|\.)nt(\.|$)/.test(p)) return "skip"; // notes (per credit/debit note)

  if (/(blk|blocked|ngav|ineli|inelig|nav)/.test(p)) return "blocked";
  if (/(itcrev|reversed|rev_)/.test(p)) return "reversed";
  return "available";
}

function add(a: Bucket, b: Bucket): Bucket {
  return {
    iamt: a.iamt + b.iamt,
    camt: a.camt + b.camt,
    samt: a.samt + b.samt,
    csamt: a.csamt + b.csamt,
  };
}

function walk(
  node: unknown,
  path: string,
  buckets: { available: Bucket; blocked: Bucket; reversed: Bucket; quartetCount: number; pathsSeen: string[] }
): void {
  if (node == null) return;
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) walk(node[i], `${path}[${i}]`, buckets);
    return;
  }
  const obj = node as Record<string, unknown>;
  const q = bucketFromObj(obj);
  if (q) {
    const cls = classify(path);
    if (cls !== "skip") {
      buckets.quartetCount++;
      buckets.pathsSeen.push(`${path} → ${cls}`);
      if (cls === "blocked") buckets.blocked = add(buckets.blocked, q);
      else if (cls === "reversed") buckets.reversed = add(buckets.reversed, q);
      else buckets.available = add(buckets.available, q);
    }
    // continue walking children — some files have nested structure
  }
  for (const [k, v] of Object.entries(obj)) {
    walk(v, path ? `${path}.${k}` : k, buckets);
  }
}

function findString(node: unknown, keys: string[]): string {
  if (node == null) return "";
  if (typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  for (const k of keys) {
    if (k in obj && typeof obj[k] === "string") {
      const v = (obj[k] as string).trim();
      if (v) return v;
    }
  }
  for (const v of Object.values(obj)) {
    const found = findString(v, keys);
    if (found) return found;
  }
  return "";
}

export function parseGstr2bJson(raw: unknown): Gstr2bParseResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Not a JSON object." };
  }

  const gstin = findString(raw, ["gstin", "GSTIN", "Gstin"]).toUpperCase();
  if (gstin.length !== 15) {
    return {
      ok: false,
      error: "JSON has no valid 15-character 'gstin' field — is this really a GSTR-2B export?",
    };
  }

  const rtnprd = findString(raw, ["rtnprd", "retPeriod", "ret_period", "RtnPrd", "period"]);
  let period = "";
  let periodLabel = "";
  if (/^\d{6}$/.test(rtnprd)) {
    const mm = rtnprd.slice(0, 2);
    const yyyy = rtnprd.slice(2);
    period = `${yyyy}-${mm}`;
    periodLabel = `${MONTH_NAMES[parseInt(mm, 10) - 1] ?? mm} ${yyyy}`;
  } else {
    return { ok: false, error: `Couldn't parse return period from rtnprd="${rtnprd}".` };
  }

  // Walk the whole tree
  const buckets = {
    available: { ...ZERO },
    blocked: { ...ZERO },
    reversed: { ...ZERO },
    quartetCount: 0,
    pathsSeen: [] as string[],
  };
  walk(raw, "", buckets);

  const totalAvailable =
    buckets.available.iamt + buckets.available.camt + buckets.available.samt;
  const totalBlocked =
    buckets.blocked.iamt + buckets.blocked.camt + buckets.blocked.samt;

  // Top-level keys we found, useful for debugging unrecognised files
  const root = (raw as Record<string, unknown>).data ?? raw;
  const summaryRoots = Object.keys(root as Record<string, unknown>);

  const diagnostic = `Found ${buckets.quartetCount} ITC summary objects. Available paths: ${buckets.pathsSeen.slice(0, 8).join("; ")}${buckets.pathsSeen.length > 8 ? "; …" : ""}`;

  if (buckets.quartetCount === 0) {
    return {
      ok: false,
      error: `No ITC amount fields (iamt/camt/samt) found in the JSON. Top-level keys: ${summaryRoots.join(", ")}. The file may be empty for this period, or in a format we don't recognise.`,
      diagnostic,
    };
  }

  if (totalAvailable === 0 && totalBlocked === 0) {
    return {
      ok: true,
      gstin,
      period,
      periodLabel,
      igstAvailable: 0,
      cgstAvailable: 0,
      sgstAvailable: 0,
      cessAvailable: 0,
      igstBlocked: 0,
      cgstBlocked: 0,
      sgstBlocked: 0,
      eligibility: "FULLY_ELIGIBLE",
      blockedReason: "",
      summaryRoots,
      diagnostic: `${diagnostic} — but all amounts are zero. Likely a NIL-ITC period.`,
    };
  }

  const eligibility: "FULLY_ELIGIBLE" | "PARTIALLY_BLOCKED" | "BLOCKED" =
    totalBlocked > 0
      ? totalAvailable > 0
        ? "PARTIALLY_BLOCKED"
        : "BLOCKED"
      : "FULLY_ELIGIBLE";

  const blockedReasonParts: string[] = [];
  if (totalBlocked > 0) blockedReasonParts.push(`Blocked per 2B: ₹ ${totalBlocked.toFixed(0)}`);
  const totalReversed =
    buckets.reversed.iamt + buckets.reversed.camt + buckets.reversed.samt;
  if (totalReversed > 0) blockedReasonParts.push(`Reversal per 2B: ₹ ${totalReversed.toFixed(0)}`);

  return {
    ok: true,
    gstin,
    period,
    periodLabel,
    igstAvailable: round2(buckets.available.iamt),
    cgstAvailable: round2(buckets.available.camt),
    sgstAvailable: round2(buckets.available.samt),
    cessAvailable: round2(buckets.available.csamt),
    igstBlocked: round2(buckets.blocked.iamt),
    cgstBlocked: round2(buckets.blocked.camt),
    sgstBlocked: round2(buckets.blocked.samt),
    eligibility,
    blockedReason: blockedReasonParts.join(" · "),
    summaryRoots,
    diagnostic,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
