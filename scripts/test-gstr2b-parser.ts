import { parseGstr2bJson } from "../src/lib/gstr2b";

console.log("=== TEST 1: Old itcsum.itcavl[] format ===");
console.log(
  JSON.stringify(
    parseGstr2bJson({
      data: {
        gstin: "27AAACA1111A1ZS",
        rtnprd: "042026",
        itcsum: {
          itcavl: [
            { ty: "B2B", iamt: 12450.5, camt: 6225.25, samt: 6225.25, csamt: 0 },
            { ty: "IMPG", iamt: 5000, camt: 0, samt: 0, csamt: 0 },
          ],
          itcblked: [{ ty: "B2B", iamt: 800, camt: 400, samt: 400, csamt: 0 }],
        },
      },
    }),
    null,
    2
  )
);

console.log("\n=== TEST 2: Newer itcsmry.{b2b,impg,...} object format ===");
console.log(
  JSON.stringify(
    parseGstr2bJson({
      data: {
        gstin: "07BSJPG4061P1ZC",
        rtnprd: "022026",
        itcsmry: {
          b2b: { iamt: 18000, camt: 9000, samt: 9000, csamt: 0 },
          b2ba: { iamt: 0, camt: 0, samt: 0, csamt: 0 },
          impg: { iamt: 4500, camt: 0, samt: 0, csamt: 0 },
          isd: { iamt: 1200, camt: 600, samt: 600, csamt: 0 },
          cdnr: { iamt: -300, camt: -150, samt: -150, csamt: 0 },
        },
      },
    }),
    null,
    2
  )
);

console.log("\n=== TEST 3: itcsumm with available/blocked split ===");
console.log(
  JSON.stringify(
    parseGstr2bJson({
      data: {
        gstin: "07BSJPG4061P1ZC",
        rtnprd: "022026",
        itcsumm: {
          available: {
            b2b: { iamt: 25000, camt: 12500, samt: 12500, csamt: 0 },
            impg: { iamt: 6000, camt: 0, samt: 0, csamt: 0 },
          },
          blocked: {
            b2b: { iamt: 1500, camt: 750, samt: 750, csamt: 0 },
          },
        },
      },
    }),
    null,
    2
  )
);

console.log("\n=== TEST 4: Newer R2B with docdata + itcsmry — should ONLY count itcsmry ===");
console.log(
  JSON.stringify(
    parseGstr2bJson({
      data: {
        gstin: "07BSJPG4061P1ZC",
        rtnprd: "022026",
        itcsmry: {
          b2b: { iamt: 50000, camt: 25000, samt: 25000, csamt: 0 },
        },
        docdata: {
          b2b: [
            // 5 invoices that sum to the same totals — should NOT be counted again
            { ctin: "...", inv: [{ iamt: 10000, camt: 5000, samt: 5000 }] },
            { ctin: "...", inv: [{ iamt: 10000, camt: 5000, samt: 5000 }] },
            { ctin: "...", inv: [{ iamt: 10000, camt: 5000, samt: 5000 }] },
            { ctin: "...", inv: [{ iamt: 10000, camt: 5000, samt: 5000 }] },
            { ctin: "...", inv: [{ iamt: 10000, camt: 5000, samt: 5000 }] },
          ],
        },
      },
    }),
    null,
    2
  )
);

console.log("\n=== TEST 5: Empty / NIL period (file has no ITC at all) ===");
console.log(
  JSON.stringify(
    parseGstr2bJson({
      data: {
        gstin: "07BSJPG4061P1ZC",
        rtnprd: "022026",
        itcsmry: {
          b2b: { iamt: 0, camt: 0, samt: 0, csamt: 0 },
        },
      },
    }),
    null,
    2
  )
);

console.log("\n=== TEST 6: Unrecognised structure with no quartet keys at all ===");
console.log(
  JSON.stringify(
    parseGstr2bJson({
      data: {
        gstin: "07BSJPG4061P1ZC",
        rtnprd: "022026",
        somethingElse: { foo: 1, bar: 2 },
      },
    }),
    null,
    2
  )
);
