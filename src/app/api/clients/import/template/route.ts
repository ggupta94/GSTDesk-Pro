import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";

const COLUMNS: Array<{ key: string; header: string; width: number; sample: string | number }> = [
  { key: "legalName", header: "Legal Name *", width: 32, sample: "Acme Manufacturing Pvt Ltd" },
  { key: "gstin", header: "GSTIN *", width: 18, sample: "27AAACA1234A1Z5" },
  { key: "tradeName", header: "Trade Name", width: 24, sample: "Acme" },
  { key: "filingFrequency", header: "Filing Frequency (MONTHLY/QUARTERLY)", width: 28, sample: "MONTHLY" },
  { key: "registrationType", header: "Registration Type (REGULAR/COMPOSITION/SEZ/CASUAL/ISD/TDS/TCS/NRTP)", width: 36, sample: "REGULAR" },
  { key: "sector", header: "Sector", width: 22, sample: "Manufacturing" },
  { key: "turnoverCrore", header: "Turnover (Cr)", width: 14, sample: 12.5 },
  { key: "contactName", header: "Contact Name", width: 22, sample: "Rohit Sharma" },
  { key: "contactEmail", header: "Contact Email", width: 28, sample: "rohit@acme.example.com" },
  { key: "contactPhone", header: "Contact Phone", width: 16, sample: "9876543210" },
  { key: "addressLine1", header: "Address Line 1", width: 28, sample: "123, Industrial Estate" },
  { key: "addressLine2", header: "Address Line 2", width: 28, sample: "Sector 12" },
  { key: "city", header: "City", width: 16, sample: "Pune" },
  { key: "pincode", header: "Pincode", width: 10, sample: "411001" },
  { key: "notes", header: "Notes", width: 32, sample: "" },
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "GSTDesk Pro";
  wb.created = new Date();

  const ws = wb.addWorksheet("Clients");
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  // header style
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
  header.alignment = { vertical: "middle", horizontal: "left" };
  header.height = 22;

  // sample row
  ws.addRow(Object.fromEntries(COLUMNS.map((c) => [c.key, c.sample])));

  // freeze header
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // notes sheet
  const notes = wb.addWorksheet("Instructions");
  notes.columns = [{ header: "Field", width: 30 }, { header: "Notes", width: 90 }];
  notes.getRow(1).font = { bold: true };
  notes.addRows([
    ["Legal Name *", "Required. Minimum 2 characters."],
    ["GSTIN *", "Required. 15-character GSTIN. State and PAN are auto-derived. Checksum is validated; invalid GSTINs are skipped."],
    ["Filing Frequency", "MONTHLY (default) or QUARTERLY (QRMP)."],
    ["Registration Type", "REGULAR (default), COMPOSITION, SEZ, CASUAL, ISD, TDS, TCS, or NRTP."],
    ["Turnover (Cr)", "Numeric, in Crore. Optional."],
    ["Contact Email", "Optional. Must be a valid email format if present."],
    ["Pincode", "Optional. 6 digits."],
    ["Duplicate GSTIN", "Rows with a GSTIN that already exists are skipped (not overwritten)."],
    ["Empty rows", "Skipped without error."],
  ]);

  const buffer = await wb.xlsx.writeBuffer();
  const u8 = new Uint8Array(buffer as ArrayBuffer);

  return new NextResponse(u8, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="gstdesk-clients-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
