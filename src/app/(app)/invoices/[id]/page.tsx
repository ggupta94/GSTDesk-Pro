import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/constants";
import { deleteInvoiceAction } from "../actions";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true, items: true, createdBy: true },
  });
  if (!inv) notFound();

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoice {inv.invoiceNumber}</h1>
          <p className="text-sm text-slate-600">
            {format(inv.invoiceDate, "dd MMM yyyy")} · {inv.client.legalName} → {inv.buyerName}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/invoices/${inv.id}/print`} target="_blank" className="btn-secondary">Print / PDF</Link>
          {can(user.role, "delete") ? (
            <form action={deleteInvoiceAction}>
              <input type="hidden" name="id" value={inv.id} />
              <button type="submit" className="btn-danger">Delete</button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-2">Supplier</h2>
          <p className="font-medium">{inv.client.legalName}</p>
          <p className="text-sm text-slate-600 font-mono">{inv.client.gstin}</p>
          <p className="text-sm text-slate-600">{inv.client.state}</p>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-2">Buyer</h2>
          <p className="font-medium">{inv.buyerName}</p>
          {inv.buyerGstin ? <p className="text-sm text-slate-600 font-mono">{inv.buyerGstin}</p> : null}
          <p className="text-sm text-slate-600">{inv.buyerAddress ?? ""}</p>
          <p className="text-sm text-slate-600">{[inv.buyerCity, inv.buyerPincode].filter(Boolean).join(", ")}</p>
          <p className="text-sm text-slate-600">Place of Supply: {inv.placeOfSupply}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="table-base">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>HSN/SAC</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Taxable</th>
              <th className="text-right">GST%</th>
              <th className="text-right">CGST</th>
              <th className="text-right">SGST</th>
              <th className="text-right">IGST</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {inv.items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>{it.description}</td>
                <td className="font-mono text-xs">{it.hsnSac}</td>
                <td className="text-right">{it.quantity} {it.unit ?? ""}</td>
                <td className="text-right">{it.rate.toFixed(2)}</td>
                <td className="text-right">{it.taxableValue.toFixed(2)}</td>
                <td className="text-right">{it.gstRate}%</td>
                <td className="text-right">{it.cgstAmount.toFixed(2)}</td>
                <td className="text-right">{it.sgstAmount.toFixed(2)}</td>
                <td className="text-right">{it.igstAmount.toFixed(2)}</td>
                <td className="text-right font-semibold">{it.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5 max-w-md ml-auto space-y-2">
        <Row label="Sub-total" value={inv.subTotal} />
        {inv.totalCgst > 0 ? <Row label="CGST" value={inv.totalCgst} /> : null}
        {inv.totalSgst > 0 ? <Row label="SGST" value={inv.totalSgst} /> : null}
        {inv.totalIgst > 0 ? <Row label="IGST" value={inv.totalIgst} /> : null}
        <div className="border-t pt-2"><Row label="Grand Total" value={inv.grandTotal} bold /></div>
        <p className="text-xs text-slate-600 italic mt-1">{inv.amountInWords}</p>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-bold text-slate-900 text-base" : "text-slate-700"}`}>
      <span>{label}</span>
      <span>₹ {value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  );
}
