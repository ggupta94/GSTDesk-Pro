import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const PRINT_STYLES = `
  @page { size: A4; margin: 14mm; }
  body.print-mode { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #111827; margin: 0; padding: 24px; font-size: 12px; line-height: 1.4; background: #fff; }
  .print-wrap { max-width: 800px; margin: 0 auto; }
  .print-wrap h1 { font-size: 22px; margin: 0 0 4px; }
  .print-wrap h2 { font-size: 13px; margin: 0 0 6px; color: #374151; text-transform: uppercase; letter-spacing: 0.04em; }
  .print-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 16px 0 24px; }
  .print-box { border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; }
  .print-items { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .print-items th, .print-items td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
  .print-items th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; }
  .print-items td.r, .print-items th.r { text-align: right; }
  .print-totals { margin-top: 16px; display: grid; grid-template-columns: 1fr 280px; gap: 24px; }
  .print-totals .row { display: flex; justify-content: space-between; padding: 4px 0; }
  .print-totals .row.total { border-top: 2px solid #111827; padding-top: 8px; font-weight: 700; font-size: 14px; }
  .print-footer { margin-top: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .print-small { color: #6b7280; font-size: 11px; }
  .print-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #111827; }
  .print-pill { display: inline-block; background: #eef2ff; color: #4338ca; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
`;

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true, items: true },
  });
  if (!inv) notFound();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES + " body { background: #fff !important; }" }} />
      <PrintButton />
      <div className="print-wrap" style={{ padding: 24 }}>
        <div className="print-header">
          <div>
            <span className="print-pill">TAX INVOICE</span>
            <h1 style={{ marginTop: 8 }}>{inv.client.legalName}</h1>
            <div className="print-small">
              {inv.client.tradeName ? `${inv.client.tradeName} · ` : ""}GSTIN: <strong>{inv.client.gstin}</strong> · PAN: {inv.client.pan}
            </div>
            <div className="print-small">
              {[inv.client.addressLine1, inv.client.addressLine2, inv.client.city, inv.client.pincode, inv.client.state].filter(Boolean).join(", ")}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h2>Invoice</h2>
            <div><strong>#</strong> {inv.invoiceNumber}</div>
            <div><strong>Date:</strong> {format(inv.invoiceDate, "dd MMM yyyy")}</div>
            <div className="print-small">Place of Supply: {inv.placeOfSupply}</div>
            <div className="print-small">{inv.supplyType === "INTRA_STATE" ? "Intra-State (CGST + SGST)" : "Inter-State (IGST)"}</div>
          </div>
        </div>

        <div className="print-meta">
          <div className="print-box">
            <h2>Bill From (Supplier)</h2>
            <div><strong>{inv.client.legalName}</strong></div>
            <div className="print-small">GSTIN: {inv.client.gstin}</div>
            <div className="print-small">{inv.client.state}</div>
          </div>
          <div className="print-box">
            <h2>Bill To (Buyer)</h2>
            <div><strong>{inv.buyerName}</strong></div>
            {inv.buyerGstin ? <div className="print-small">GSTIN: {inv.buyerGstin}</div> : null}
            <div className="print-small">{[inv.buyerAddress, inv.buyerCity, inv.buyerPincode].filter(Boolean).join(", ")}</div>
            <div className="print-small">State Code: {inv.buyerStateCode}</div>
          </div>
        </div>

        <table className="print-items">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>HSN/SAC</th>
              <th className="r">Qty</th>
              <th className="r">Rate</th>
              <th className="r">Taxable</th>
              <th className="r">GST%</th>
              {inv.supplyType === "INTRA_STATE" ? (
                <>
                  <th className="r">CGST</th>
                  <th className="r">SGST</th>
                </>
              ) : (
                <th className="r">IGST</th>
              )}
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={it.id}>
                <td>{i + 1}</td>
                <td>{it.description}</td>
                <td>{it.hsnSac}</td>
                <td className="r">{it.quantity}{it.unit ? ` ${it.unit}` : ""}</td>
                <td className="r">{it.rate.toFixed(2)}</td>
                <td className="r">{it.taxableValue.toFixed(2)}</td>
                <td className="r">{it.gstRate}%</td>
                {inv.supplyType === "INTRA_STATE" ? (
                  <>
                    <td className="r">{it.cgstAmount.toFixed(2)}</td>
                    <td className="r">{it.sgstAmount.toFixed(2)}</td>
                  </>
                ) : (
                  <td className="r">{it.igstAmount.toFixed(2)}</td>
                )}
                <td className="r">{it.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="print-totals">
          <div>
            <h2>Amount in Words</h2>
            <div style={{ fontStyle: "italic" }}>{inv.amountInWords}</div>
            {inv.notes ? (
              <>
                <h2 style={{ marginTop: 12 }}>Notes</h2>
                <div className="print-small" style={{ whiteSpace: "pre-wrap" }}>{inv.notes}</div>
              </>
            ) : null}
          </div>
          <div className="print-box">
            <div className="row" style={{ display: "flex", justifyContent: "space-between" }}><span>Sub-total</span><span>₹ {inv.subTotal.toFixed(2)}</span></div>
            {inv.totalCgst > 0 ? <div style={{ display: "flex", justifyContent: "space-between" }}><span>CGST</span><span>₹ {inv.totalCgst.toFixed(2)}</span></div> : null}
            {inv.totalSgst > 0 ? <div style={{ display: "flex", justifyContent: "space-between" }}><span>SGST</span><span>₹ {inv.totalSgst.toFixed(2)}</span></div> : null}
            {inv.totalIgst > 0 ? <div style={{ display: "flex", justifyContent: "space-between" }}><span>IGST</span><span>₹ {inv.totalIgst.toFixed(2)}</span></div> : null}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #111827", paddingTop: 8, marginTop: 6, fontWeight: 700, fontSize: 14 }}><span>Grand Total</span><span>₹ {inv.grandTotal.toFixed(2)}</span></div>
          </div>
        </div>

        <div className="print-footer">
          <div>
            {inv.bankName ? (
              <>
                <h2>Bank Details</h2>
                <div className="print-small">Bank: {inv.bankName}</div>
                {inv.bankAccount ? <div className="print-small">A/C: {inv.bankAccount}</div> : null}
                {inv.bankIfsc ? <div className="print-small">IFSC: {inv.bankIfsc}</div> : null}
              </>
            ) : null}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ height: 56 }}></div>
            <div style={{ borderTop: "1px solid #111827", paddingTop: 6 }}>Authorised Signatory</div>
            <div className="print-small">For {inv.client.legalName}</div>
          </div>
        </div>

        <div className="print-small" style={{ textAlign: "center", marginTop: 24, color: "#9ca3af" }}>
          This is a computer-generated invoice issued under GST Invoice Rules, 2017.
        </div>
      </div>
    </>
  );
}
