import { STATE_CODES } from "./state-codes";

// GSTIN format: 2 state code + 10 PAN + 1 entity code + 1 (Z by default) + 1 checksum
// Total 15 chars. Checksum is GSTN portal mod-36 algorithm.

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function gstinChecksum(first14: string): string {
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    const code = CHARSET.indexOf(first14[i]);
    if (code === -1) return "";
    const factor = i % 2 === 0 ? 1 : 2;
    let prod = code * factor;
    prod = Math.floor(prod / 36) + (prod % 36);
    sum += prod;
  }
  const remainder = sum % 36;
  const checkCode = (36 - remainder) % 36;
  return CHARSET[checkCode];
}

export type GstinValidation =
  | { ok: true; pan: string; stateCode: string; state: string; entityCode: string }
  | { ok: false; error: string };

export function validateGstin(gstinRaw: string): GstinValidation {
  const gstin = (gstinRaw || "").toUpperCase().trim();
  if (gstin.length !== 15) {
    return { ok: false, error: "GSTIN must be exactly 15 characters." };
  }
  if (!GSTIN_REGEX.test(gstin)) {
    return { ok: false, error: "GSTIN format is invalid." };
  }
  const stateCode = gstin.slice(0, 2);
  if (!STATE_CODES[stateCode]) {
    return { ok: false, error: `Invalid state code: ${stateCode}.` };
  }
  const pan = gstin.slice(2, 12);
  if (!PAN_REGEX.test(pan)) {
    return { ok: false, error: "Embedded PAN is invalid." };
  }
  const expected = gstinChecksum(gstin.slice(0, 14));
  if (expected !== gstin[14]) {
    return {
      ok: false,
      error: `Checksum mismatch. Expected last char "${expected}", got "${gstin[14]}".`,
    };
  }
  return {
    ok: true,
    pan,
    stateCode,
    state: STATE_CODES[stateCode],
    entityCode: gstin[12],
  };
}

export function isValidPan(pan: string): boolean {
  return PAN_REGEX.test((pan || "").toUpperCase().trim());
}
