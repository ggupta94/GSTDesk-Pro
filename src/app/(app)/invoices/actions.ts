"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, logActivity } from "@/lib/auth";
import { can } from "@/lib/constants";
import { round2 } from "@/lib/gst";
import { amountInWords } from "@/lib/amount-in-words";

const ItemInput = z.object({
  description: z.string().min(1),
  hsnSac: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unit: z.string().optional(),
  rate: z.coerce.number().nonnegative(),
  gstRate: z.coerce.number().nonnegative(),
});

const InvoiceInput = z.object({
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().min(1),
  clientId: z.string().min(1),
  buyerName: z.string().min(1),
  buyerGstin: z.string().optional(),
  buyerStateCode: z.string().length(2),
  buyerAddress: z.string().optional(),
  buyerCity: z.string().optional(),
  buyerPincode: z.string().optional(),
  placeOfSupply: z.string().min(1),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  bankIfsc: z.string().optional(),
  notes: z.string().optional(),
});

export async function createInvoiceAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "write")) redirect("/invoices?error=No+permission");

  const raw = Object.fromEntries(formData.entries());
  const parsed = InvoiceInput.safeParse(raw);
  if (!parsed.success) redirect(`/invoices/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const data = parsed.data;

  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) redirect("/invoices/new?error=Client+not+found");

  // Parse items: descriptions/hsnSacs/quantities/units/rates/gstRates as parallel arrays
  const descriptions = formData.getAll("desc[]").map(String);
  const hsns = formData.getAll("hsn[]").map(String);
  const qtys = formData.getAll("qty[]").map(String);
  const units = formData.getAll("unit[]").map(String);
  const rates = formData.getAll("rate[]").map(String);
  const gstRates = formData.getAll("gstRate[]").map(String);

  if (descriptions.length === 0) redirect("/invoices/new?error=Add+at+least+one+line+item");

  const supplierState = client.stateCode;
  const buyerState = data.buyerStateCode;
  const supplyType: "INTRA_STATE" | "INTER_STATE" =
    supplierState === buyerState ? "INTRA_STATE" : "INTER_STATE";

  let subTotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  const items: Array<{
    description: string;
    hsnSac: string;
    quantity: number;
    unit: string | null;
    rate: number;
    taxableValue: number;
    gstRate: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    cessAmount: number;
    lineTotal: number;
  }> = [];

  for (let i = 0; i < descriptions.length; i++) {
    const itemParse = ItemInput.safeParse({
      description: descriptions[i],
      hsnSac: hsns[i],
      quantity: qtys[i],
      unit: units[i],
      rate: rates[i],
      gstRate: gstRates[i],
    });
    if (!itemParse.success) continue;
    const it = itemParse.data;
    const taxable = round2(it.quantity * it.rate);
    const taxAmt = round2(taxable * (it.gstRate / 100));
    let cgst = 0, sgst = 0, igst = 0;
    if (supplyType === "INTRA_STATE") {
      cgst = round2(taxAmt / 2);
      sgst = round2(taxAmt / 2);
    } else {
      igst = taxAmt;
    }
    const line = round2(taxable + cgst + sgst + igst);
    subTotal += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    items.push({
      description: it.description,
      hsnSac: it.hsnSac,
      quantity: it.quantity,
      unit: it.unit || null,
      rate: it.rate,
      taxableValue: taxable,
      gstRate: it.gstRate,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      cessAmount: 0,
      lineTotal: line,
    });
  }

  if (items.length === 0) redirect("/invoices/new?error=All+line+items+were+invalid");

  const grandTotal = round2(subTotal + totalCgst + totalSgst + totalIgst);

  try {
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: data.invoiceNumber.trim(),
        invoiceDate: new Date(data.invoiceDate),
        clientId: data.clientId,
        buyerName: data.buyerName,
        buyerGstin: data.buyerGstin?.toUpperCase() || null,
        buyerStateCode: data.buyerStateCode,
        buyerAddress: data.buyerAddress || null,
        buyerCity: data.buyerCity || null,
        buyerPincode: data.buyerPincode || null,
        supplyType,
        placeOfSupply: data.placeOfSupply,
        subTotal: round2(subTotal),
        totalCgst: round2(totalCgst),
        totalSgst: round2(totalSgst),
        totalIgst: round2(totalIgst),
        totalCess: 0,
        grandTotal,
        amountInWords: amountInWords(grandTotal),
        bankName: data.bankName || null,
        bankAccount: data.bankAccount || null,
        bankIfsc: data.bankIfsc || null,
        notes: data.notes || null,
        createdById: user.id,
        items: { create: items },
      },
    });
    await logActivity(user.id, "invoice.create", "Invoice", invoice.id, { number: invoice.invoiceNumber });
    revalidatePath("/invoices");
    redirect(`/invoices/${invoice.id}`);
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message.includes("Unique") ? "Invoice number already exists" : "Failed";
    redirect(`/invoices/new?error=${encodeURIComponent(msg)}`);
  }
}

export async function deleteInvoiceAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "delete")) redirect("/invoices?error=No+permission");
  const id = String(formData.get("id") || "");
  if (!id) redirect("/invoices");
  await prisma.invoice.delete({ where: { id } });
  await logActivity(user.id, "invoice.delete", "Invoice", id);
  revalidatePath("/invoices");
  redirect("/invoices");
}
