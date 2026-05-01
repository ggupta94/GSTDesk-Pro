import { validateGstin } from "../src/lib/gstin";
const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function chk(s: string) {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const c = CHARSET.indexOf(s[i]);
    const f = i % 2 === 0 ? 1 : 2;
    let p = c * f;
    p = Math.floor(p / 36) + (p % 36);
    sum += p;
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}
const base = "29AAACX1234A1Z";
const valid = base + chk(base);
console.log("Generated valid GSTIN:", valid);
console.log(JSON.stringify(validateGstin(valid), null, 2));
