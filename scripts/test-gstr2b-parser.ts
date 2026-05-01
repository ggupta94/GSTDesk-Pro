import { parseGstr2bJson } from "../src/lib/gstr2b";

// Synthetic but realistic GSTR-2B JSON (current GSTN format).
const sample = {
  data: {
    gstin: "27AAACA1111A1ZS",
    rtnprd: "042026",
    chksum: "abc123",
    version: "1.0",
    gendt: "12-05-2026",
    itcsum: {
      itcavl: [
        { ty: "B2B", iamt: 12450.5, camt: 6225.25, samt: 6225.25, csamt: 0 },
        { ty: "IMPG", iamt: 5000, camt: 0, samt: 0, csamt: 0 },
        { ty: "ISD", iamt: 1500, camt: 750, samt: 750, csamt: 0 },
      ],
      itcblked: [{ ty: "B2B", iamt: 800, camt: 400, samt: 400, csamt: 0 }],
      itcrev: [{ ty: "B2BA", iamt: 200, camt: 100, samt: 100, csamt: 0 }],
      itcngav: [],
    },
  },
};

console.log("Parsing realistic GSTR-2B sample:");
console.log(JSON.stringify(parseGstr2bJson(sample), null, 2));

console.log("\nMissing rtnprd:");
console.log(parseGstr2bJson({ data: { gstin: "27AAACA1111A1ZS" } }));

console.log("\nNot a JSON object:");
console.log(parseGstr2bJson("nope"));

console.log("\nGSTIN mismatch / missing:");
console.log(parseGstr2bJson({ data: { rtnprd: "042026" } }));

console.log("\nFully blocked (no available):");
console.log(
  parseGstr2bJson({
    data: {
      gstin: "27AAACA1111A1ZS",
      rtnprd: "032026",
      itcsum: {
        itcblked: [{ ty: "B2B", iamt: 5000, camt: 2000, samt: 2000 }],
      },
    },
  })
);
