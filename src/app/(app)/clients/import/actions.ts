"use server";

import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, logActivity } from "@/lib/auth";
import { can, REGISTRATION_TYPES } from "@/lib/constants";
import { validateGstin } from "@/lib/gstin";

export type RowResult = {
  rowNumber: number;
  legalName: string;
  gstin: string;
  status: "imported" | "skipped" | "error";
  message: string;
};

export type ImportResult = {
  ok: boolean;
  total: number;
  imported: number;
  skipped: number;
  errors: number;
  rows: RowResult[];
  fatal?: string;
};

const RowSchema = z.object({
  legalName: z.string().trim().min(2, "Legal Name is required"),
  gstin: z.string().trim().toUpperCase(),
  tradeName: z.string().trim().optional(),
  filingFrequency: z.enum(["MONTHLY", "QUARTERLY"]).default("MONTHLY"),
  registrationType: z.enum(REGISTRATION_TYPES).default("REGULAR"),
  sector: z.string().trim().optional(),
  turnoverCrore: z.coerce.number().nonnegative().optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  contactPhone: z.string().trim().optional(),
  addressLine1: z.string().trim().optional(),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().optional(),
  pincode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const FIELD_MAP: Record<string, keyof z.infer<typeof RowSchema>> = {
  "legal name": "legalName",
  "legal name *": "legalName",
  "name": "legalName",
  "gstin": "gstin",
  "gstin *": "gstin",
  "trade name": "tradeName",
  "filing frequency": "filingFrequency",
  "frequency": "filingFrequency",
  "registration type": "registrationType",
  "type": "registrationType",
  "sector": "sector",
  "turnover": "turnoverCrore",
  "turnover (cr)": "turnoverCrore",
  "contact name": "contactName",
  "contact email": "contactEmail",
  "email": "contactEmail",
  "contact phone": "contactPhone",
  "phone": "contactPhone",
  "address line 1": "addressLine1",
  "address 1": "addressLine1",
  "address line 2": "addressLine2",
  "address 2": "addressLine2",
  "city": "city",
  "pincode": "pincode",
  "notes": "notes",
};

function normalizeHeader(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // drop parenthetical hints, but keep "*"
    .replace(/\*/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v == null) return undefined;
  if (typeof v === "object") {
    // handle hyperlink, formula result, rich text
    if ("text" in v && typeof (v as { text: unknown }).text === "string") return (v as { text: string }).text;
    if ("result" in v) return (v as { result: unknown }).result;
    if ("richText" in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    }
  }
  return v;
}

export async function importClientsAction(formData: FormData): Promise<ImportResult> {
  const user = await requireUser();
  if (!can(user.role, "write")) {
    return { ok: false, total: 0, imported: 0, skipped: 0, errors: 0, rows: [], fatal: "No permission" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, total: 0, imported: 0, skipped: 0, errors: 0, rows: [], fatal: "No file uploaded" };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, total: 0, imported: 0, skipped: 0, errors: 0, rows: [], fatal: "File too large (max 10 MB)" };
  }

  let workbook: ExcelJS.Workbook;
  try {
    const buf = await file.arrayBuffer();
    workbook = new ExcelJS.Workbook();
    // exceljs types pin to an older Buffer shape; runtime accepts ArrayBuffer fine
    await workbook.xlsx.load(buf as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (e: unknown) {
    return {
      ok: false,
      total: 0,
      imported: 0,
      skipped: 0,
      errors: 0,
      rows: [],
      fatal: `Could not read workbook: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  }

  const ws = workbook.worksheets[0];
  if (!ws || ws.rowCount < 2) {
    return { ok: false, total: 0, imported: 0, skipped: 0, errors: 0, rows: [], fatal: "Sheet has no data rows" };
  }

  // Map headers (row 1) to field keys via FIELD_MAP
  const headerRow = ws.getRow(1);
  const colToField: Record<number, keyof z.infer<typeof RowSchema>> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const norm = normalizeHeader(cellValue(cell));
    const field = FIELD_MAP[norm];
    if (field) colToField[colNumber] = field;
  });

  if (!Object.values(colToField).includes("legalName") || !Object.values(colToField).includes("gstin")) {
    return {
      ok: false,
      total: 0,
      imported: 0,
      skipped: 0,
      errors: 0,
      rows: [],
      fatal: "Headers must include 'Legal Name' and 'GSTIN' columns. Use the template.",
    };
  }

  const results: RowResult[] = [];
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let total = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;

    const obj: Record<string, unknown> = {};
    for (const [colStr, field] of Object.entries(colToField)) {
      const col = parseInt(colStr, 10);
      const v = cellValue(row.getCell(col));
      if (v != null && v !== "") obj[field] = v;
    }

    // skip totally empty
    if (!obj.legalName && !obj.gstin) continue;
    total += 1;

    const legalName = String(obj.legalName ?? "").trim();
    const gstinRaw = String(obj.gstin ?? "").trim().toUpperCase();

    const parsed = RowSchema.safeParse(obj);
    if (!parsed.success) {
      errors += 1;
      results.push({
        rowNumber: r,
        legalName,
        gstin: gstinRaw,
        status: "error",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      continue;
    }
    const data = parsed.data;

    const gv = validateGstin(data.gstin);
    if (!gv.ok) {
      errors += 1;
      results.push({ rowNumber: r, legalName, gstin: data.gstin, status: "error", message: gv.error });
      continue;
    }

    // duplicate check
    const existing = await prisma.client.findUnique({ where: { gstin: data.gstin } });
    if (existing) {
      skipped += 1;
      results.push({ rowNumber: r, legalName, gstin: data.gstin, status: "skipped", message: "GSTIN already exists" });
      continue;
    }

    try {
      await prisma.client.create({
        data: {
          legalName: data.legalName,
          tradeName: data.tradeName || null,
          gstin: data.gstin,
          pan: gv.pan,
          stateCode: gv.stateCode,
          state: gv.state,
          filingFrequency: data.filingFrequency,
          registrationType: data.registrationType,
          sector: data.sector || null,
          turnoverCrore: data.turnoverCrore ?? null,
          contactName: data.contactName || null,
          contactEmail: data.contactEmail || null,
          contactPhone: data.contactPhone || null,
          addressLine1: data.addressLine1 || null,
          addressLine2: data.addressLine2 || null,
          city: data.city || null,
          pincode: data.pincode || null,
          notes: data.notes || null,
        },
      });
      imported += 1;
      results.push({ rowNumber: r, legalName, gstin: data.gstin, status: "imported", message: "Created" });
    } catch (e: unknown) {
      errors += 1;
      results.push({
        rowNumber: r,
        legalName,
        gstin: data.gstin,
        status: "error",
        message: e instanceof Error ? e.message : "Insert failed",
      });
    }
  }

  await logActivity(user.id, "client.bulkImport", "Client", undefined, { total, imported, skipped, errors });

  return { ok: true, total, imported, skipped, errors, rows: results };
}
