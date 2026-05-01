// Smoke-test the Excel import parser logic without going through Next/auth.
// Reads /tmp/test-import.xlsx, runs the same header-mapping + Zod validation
// + GSTIN check that the server action does, prints per-row results.
import ExcelJS from "exceljs";
import { z } from "zod";
import { validateGstin } from "../src/lib/gstin";
import { REGISTRATION_TYPES } from "../src/lib/constants";

const RowSchema = z.object({
  legalName: z.string().trim().min(2),
  gstin: z.string().trim().toUpperCase(),
  tradeName: z.string().trim().optional(),
  filingFrequency: z.enum(["MONTHLY", "QUARTERLY"]).default("MONTHLY"),
  registrationType: z.enum(REGISTRATION_TYPES).default("REGULAR"),
  sector: z.string().trim().optional(),
  turnoverCrore: z.coerce.number().nonnegative().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email().optional().or(z.literal("")),
  contactPhone: z.string().trim().optional(),
  addressLine1: z.string().trim().optional(),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const FIELD_MAP: Record<string, string> = {
  "legal name": "legalName",
  "gstin": "gstin",
  "trade name": "tradeName",
  "filing frequency": "filingFrequency",
  "registration type": "registrationType",
  "sector": "sector",
  "turnover": "turnoverCrore",
  "contact name": "contactName",
  "contact email": "contactEmail",
  "contact phone": "contactPhone",
  "address line 1": "addressLine1",
  "address line 2": "addressLine2",
  "city": "city",
  "pincode": "pincode",
  "notes": "notes",
};

function normalizeHeader(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\*/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("C:/Users/Dell/AppData/Local/Temp/test-import.xlsx");
  const ws = wb.worksheets[0];

  const colToField: Record<number, string> = {};
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const norm = normalizeHeader(cell.value);
    const f = FIELD_MAP[norm];
    if (f) colToField[colNumber] = f;
  });

  console.log("Header mapping:", colToField);
  console.log("---");

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    const obj: Record<string, unknown> = {};
    for (const [colStr, field] of Object.entries(colToField)) {
      const v = row.getCell(parseInt(colStr, 10)).value;
      if (v != null && v !== "") obj[field] = v;
    }
    if (!obj.legalName && !obj.gstin) {
      console.log(`Row ${r}: empty (skipped silently)`);
      continue;
    }
    const parsed = RowSchema.safeParse(obj);
    if (!parsed.success) {
      console.log(`Row ${r}: ZOD ERROR — ${parsed.error.issues.map((i) => i.message).join("; ")}`);
      continue;
    }
    const gv = validateGstin(parsed.data.gstin);
    if (!gv.ok) {
      console.log(`Row ${r}: GSTIN INVALID — ${gv.error}`);
      continue;
    }
    console.log(
      `Row ${r}: OK ${parsed.data.legalName} (${parsed.data.gstin}) -> ${gv.state}, PAN ${gv.pan}, freq ${parsed.data.filingFrequency}`
    );
  }
})();
