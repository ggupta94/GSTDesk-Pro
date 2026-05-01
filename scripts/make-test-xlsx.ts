import ExcelJS from "exceljs";
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
function gstin(stateCode: string, panBody: string, entity: string = "1") {
  const base = `${stateCode}${panBody}${entity}Z`;
  return base + chk(base);
}

const valid1 = gstin("27", "AAACA1111A");
const valid2 = gstin("33", "AAACB2222B");
const valid3 = gstin("07", "AAACC3333C");
const invalid = "ABCDEFGHIJKLMNO"; // 15 chars but invalid format

console.log("Valid GSTINs:");
[valid1, valid2, valid3].forEach((g) => console.log(" -", g, "->", JSON.stringify(validateGstin(g))));
console.log("Invalid GSTIN:", invalid);

(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Clients");
  ws.addRow([
    "Legal Name *",
    "GSTIN *",
    "Trade Name",
    "Filing Frequency",
    "Registration Type",
    "Sector",
    "Turnover (Cr)",
    "Contact Name",
    "Contact Email",
    "Contact Phone",
    "Address Line 1",
    "Address Line 2",
    "City",
    "Pincode",
    "Notes",
  ]);
  ws.addRow(["Test Co A Pvt Ltd", valid1, "TestA", "MONTHLY", "REGULAR", "IT", 5.5, "Alice", "a@x.com", "9999900001", "Addr1", "Addr2", "Mumbai", "400001", "first valid"]);
  ws.addRow(["Test Co B LLP", valid2, "TestB", "QUARTERLY", "REGULAR", "Trading", 1.2, "Bob", "b@x.com", "9999900002", "", "", "Chennai", "600001", "second valid"]);
  ws.addRow(["Test Co C", valid3, "", "MONTHLY", "REGULAR", "", "", "", "", "", "", "", "", "", "third valid"]);
  ws.addRow(["Bad GSTIN Co", invalid, "", "MONTHLY", "REGULAR", "", "", "", "", "", "", "", "", "", "should error"]);
  ws.addRow(["Acme Manufacturing Pvt Ltd", "27AAACA1234A1Z5", "Acme", "MONTHLY", "REGULAR", "", "", "", "", "", "", "", "", "", "should be skipped (already in DB)"]);
  ws.addRow(["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]); // empty row -> skipped silently

  const out = "C:/Users/Dell/AppData/Local/Temp/test-import.xlsx";
  await wb.xlsx.writeFile(out);
  console.log("Wrote", out);
})();
