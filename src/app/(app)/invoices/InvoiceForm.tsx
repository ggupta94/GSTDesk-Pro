"use client";

import { useMemo, useState } from "react";
import { createInvoiceAction } from "./actions";
import { STATE_OPTIONS } from "@/lib/state-codes";
import { GST_RATES } from "@/lib/constants";

type ClientLite = { id: string; legalName: string; gstin: string; stateCode: string; state: string };
type Item = { description: string; hsnSac: string; quantity: number; unit: string; rate: number; gstRate: number };

const blank: Item = { description: "", hsnSac: "", quantity: 1, unit: "Nos", rate: 0, gstRate: 18 };

export default function InvoiceForm({ clients }: { clients: ClientLite[] }) {
  const [clientId, setClientId] = useState<string>("");
  const [buyerStateCode, setBuyerStateCode] = useState<string>("");
  const [items, setItems] = useState<Item[]>([{ ...blank }]);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const supplier = clients.find((c) => c.id === clientId);
  const supplyType = supplier && buyerStateCode
    ? supplier.stateCode === buyerStateCode ? "INTRA_STATE" : "INTER_STATE"
    : null;

  const totals = useMemo(() => {
    let subTotal = 0, cgst = 0, sgst = 0, igst = 0;
    for (const it of items) {
      const taxable = round2(it.quantity * it.rate);
      const tax = round2(taxable * (it.gstRate / 100));
      subTotal += taxable;
      if (supplyType === "INTRA_STATE") {
        cgst += tax / 2;
        sgst += tax / 2;
      } else if (supplyType === "INTER_STATE") {
        igst += tax;
      }
    }
    return {
      subTotal: round2(subTotal),
      cgst: round2(cgst),
      sgst: round2(sgst),
      igst: round2(igst),
      total: round2(subTotal + cgst + sgst + igst),
    };
  }, [items, supplyType]);

  function update(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function addRow() { setItems((prev) => [...prev, { ...blank }]); }
  function removeRow(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }

  return (
    <form action={createInvoiceAction} className="space-y-6">
      <div className="card p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Invoice Number *</label>
          <input name="invoiceNumber" className="input" required placeholder="INV-2026-001" />
        </div>
        <div>
          <label className="label">Invoice Date *</label>
          <input name="invoiceDate" type="date" defaultValue={today} className="input" required />
        </div>
        <div>
          <label className="label">Supplier (Your Client) *</label>
          <select name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} className="input" required>
            <option value="">— Select —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.legalName} — {c.gstin}</option>)}
          </select>
          {supplier ? <p className="text-xs text-slate-500 mt-1">State: {supplier.state} ({supplier.stateCode})</p> : null}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Buyer / Recipient</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="label">Name *</label>
            <input name="buyerName" className="input" required />
          </div>
          <div>
            <label className="label">GSTIN (if registered)</label>
            <input name="buyerGstin" className="input font-mono" maxLength={15} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Address</label>
            <input name="buyerAddress" className="input" />
          </div>
          <div>
            <label className="label">City</label>
            <input name="buyerCity" className="input" />
          </div>
          <div>
            <label className="label">Pincode</label>
            <input name="buyerPincode" className="input" maxLength={6} />
          </div>
          <div>
            <label className="label">State *</label>
            <select
              name="buyerStateCode"
              value={buyerStateCode}
              onChange={(e) => setBuyerStateCode(e.target.value)}
              className="input"
              required
            >
              <option value="">— Select —</option>
              {STATE_OPTIONS.map((s) => (
                <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Place of Supply *</label>
            <input name="placeOfSupply" className="input" required placeholder="State name" />
          </div>
        </div>
        {supplyType ? (
          <div className={`text-sm ${supplyType === "INTRA_STATE" ? "text-blue-700" : "text-amber-700"}`}>
            Detected: <strong>{supplyType === "INTRA_STATE" ? "Intra-State (CGST + SGST)" : "Inter-State (IGST)"}</strong>
          </div>
        ) : null}
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Line Items</h2>
          <button type="button" onClick={addRow} className="btn-secondary text-sm">+ Add Row</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-2 text-left">Description</th>
                <th className="px-2 py-2 text-left">HSN/SAC</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-left">Unit</th>
                <th className="px-2 py-2 text-right">Rate</th>
                <th className="px-2 py-2 text-right">GST %</th>
                <th className="px-2 py-2 text-right">Taxable</th>
                <th className="px-2 py-2 text-right">Tax</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const taxable = round2(it.quantity * it.rate);
                const tax = round2(taxable * (it.gstRate / 100));
                return (
                  <tr key={i} className="border-t">
                    <td className="px-1 py-1">
                      <input name="desc[]" value={it.description} onChange={(e) => update(i, { description: e.target.value })} className="input" required />
                    </td>
                    <td className="px-1 py-1">
                      <input name="hsn[]" value={it.hsnSac} onChange={(e) => update(i, { hsnSac: e.target.value })} className="input font-mono w-28" required />
                    </td>
                    <td className="px-1 py-1">
                      <input name="qty[]" type="number" step="0.001" value={it.quantity} onChange={(e) => update(i, { quantity: parseFloat(e.target.value) || 0 })} className="input w-20 text-right" required />
                    </td>
                    <td className="px-1 py-1">
                      <input name="unit[]" value={it.unit} onChange={(e) => update(i, { unit: e.target.value })} className="input w-20" />
                    </td>
                    <td className="px-1 py-1">
                      <input name="rate[]" type="number" step="0.01" value={it.rate} onChange={(e) => update(i, { rate: parseFloat(e.target.value) || 0 })} className="input w-28 text-right" required />
                    </td>
                    <td className="px-1 py-1">
                      <select name="gstRate[]" value={it.gstRate} onChange={(e) => update(i, { gstRate: parseFloat(e.target.value) })} className="input w-20">
                        {GST_RATES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1 text-right">{taxable.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right">{tax.toFixed(2)}</td>
                    <td className="px-2 py-1 text-right font-semibold">{(taxable + tax).toFixed(2)}</td>
                    <td className="px-1 py-1">
                      <button type="button" onClick={() => removeRow(i)} disabled={items.length === 1} className="text-red-600 hover:underline text-xs">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Bank Details (optional)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="label">Bank Name</label><input name="bankName" className="input" /></div>
            <div><label className="label">A/C Number</label><input name="bankAccount" className="input" /></div>
            <div className="md:col-span-2"><label className="label">IFSC</label><input name="bankIfsc" className="input font-mono" /></div>
          </div>
          <div>
            <label className="label">Notes / Terms</label>
            <textarea name="notes" rows={3} className="input" defaultValue="Payment due within 15 days." />
          </div>
        </div>

        <div className="card p-5 space-y-2">
          <h2 className="font-semibold text-slate-900">Summary</h2>
          <Row label="Sub-total (taxable)" value={totals.subTotal} />
          {supplyType === "INTRA_STATE" ? (
            <>
              <Row label="CGST" value={totals.cgst} />
              <Row label="SGST" value={totals.sgst} />
            </>
          ) : supplyType === "INTER_STATE" ? (
            <Row label="IGST" value={totals.igst} />
          ) : null}
          <div className="border-t pt-2">
            <Row label="Grand Total" value={totals.total} bold />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" type="submit">Create Invoice</button>
      </div>
    </form>
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

function round2(n: number) { return Math.round(n * 100) / 100; }
