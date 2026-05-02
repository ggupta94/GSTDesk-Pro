// Rule 88A utilisation engine.
//
// Given (a) ITC available — IGST/CGST/SGST credits sitting in the ledger, and
// (b) output tax liability for the period — it returns how much of each
// credit head gets utilised, the cash payable per head, and the carry-forward
// balance.
//
// Order of utilisation per s.49 CGST Act + Rule 88A (post-2018 amendment):
//
//   IGST liability        ← IGST credit  → CGST credit → SGST credit
//   CGST liability        ← IGST credit (any leftover) → CGST credit
//   SGST liability        ← IGST credit (any leftover) → SGST credit
//
// CGST credit can NEVER offset SGST liability. SGST credit can NEVER offset
// CGST liability. (s.49(5)(c) & (d).) IGST is the only "fungible" credit.
//
// Whatever liability remains after all credit utilisation is cash payable.

export type TaxSet = { igst: number; cgst: number; sgst: number };

export type UtilisationResult = {
  utilised: TaxSet; // credits consumed per head
  cashPayable: TaxSet; // residual liability per head
  balance: TaxSet; // unconsumed credit per head (carry forward)
  total: {
    output: number;
    available: number;
    utilised: number;
    cashPayable: number;
    balance: number;
  };
};

const ZERO: TaxSet = { igst: 0, cgst: 0, sgst: 0 };

export function calculateUtilisation(
  available: TaxSet = ZERO,
  liability: TaxSet = ZERO
): UtilisationResult {
  // Working copies; mutate as we consume.
  let igstCr = nonNeg(available.igst);
  let cgstCr = nonNeg(available.cgst);
  let sgstCr = nonNeg(available.sgst);

  let igstLi = nonNeg(liability.igst);
  let cgstLi = nonNeg(liability.cgst);
  let sgstLi = nonNeg(liability.sgst);

  let igstUsed = 0;
  let cgstUsed = 0;
  let sgstUsed = 0;

  // ── Step 1: Pay IGST liability ─────────────────────────────
  // 1a) IGST credit
  let take = Math.min(igstCr, igstLi);
  igstCr -= take; igstLi -= take; igstUsed += take;
  // 1b) CGST credit
  take = Math.min(cgstCr, igstLi);
  cgstCr -= take; igstLi -= take; cgstUsed += take;
  // 1c) SGST credit
  take = Math.min(sgstCr, igstLi);
  sgstCr -= take; igstLi -= take; sgstUsed += take;

  // ── Step 2: Pay CGST liability ─────────────────────────────
  // 2a) IGST credit (any leftover after Step 1)
  take = Math.min(igstCr, cgstLi);
  igstCr -= take; cgstLi -= take; igstUsed += take;
  // 2b) CGST credit
  take = Math.min(cgstCr, cgstLi);
  cgstCr -= take; cgstLi -= take; cgstUsed += take;

  // ── Step 3: Pay SGST liability ─────────────────────────────
  // 3a) IGST credit
  take = Math.min(igstCr, sgstLi);
  igstCr -= take; sgstLi -= take; igstUsed += take;
  // 3b) SGST credit
  take = Math.min(sgstCr, sgstLi);
  sgstCr -= take; sgstLi -= take; sgstUsed += take;

  const utilised: TaxSet = { igst: r(igstUsed), cgst: r(cgstUsed), sgst: r(sgstUsed) };
  const cashPayable: TaxSet = { igst: r(igstLi), cgst: r(cgstLi), sgst: r(sgstLi) };
  const balance: TaxSet = { igst: r(igstCr), cgst: r(cgstCr), sgst: r(sgstCr) };

  const sum = (s: TaxSet) => s.igst + s.cgst + s.sgst;

  return {
    utilised,
    cashPayable,
    balance,
    total: {
      output: r(sum(liability)),
      available: r(sum(available)),
      utilised: r(sum(utilised)),
      cashPayable: r(sum(cashPayable)),
      balance: r(sum(balance)),
    },
  };
}

function nonNeg(n: number) {
  return n > 0 && isFinite(n) ? n : 0;
}
function r(n: number) {
  return Math.round(n * 100) / 100;
}
