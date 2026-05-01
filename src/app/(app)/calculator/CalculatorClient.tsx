"use client";

import { useMemo, useState } from "react";
import { GST_RATES } from "@/lib/constants";
import { splitGst } from "@/lib/gst";
import { calculateDueDate } from "@/lib/gst";

export default function CalculatorClient() {
  const [amount, setAmount] = useState<number>(1000);
  const [rate, setRate] = useState<number>(18);
  const [inclusive, setInclusive] = useState<boolean>(false);
  const [intra, setIntra] = useState<boolean>(true);

  const result = useMemo(() => splitGst(amount || 0, rate, inclusive, intra), [amount, rate, inclusive, intra]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Tax Calculator</h2>
        <div>
          <label className="label">Amount (₹)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            className="input"
            step="0.01"
          />
        </div>
        <div>
          <label className="label">GST Rate</label>
          <div className="flex flex-wrap gap-2">
            {GST_RATES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRate(r)}
                className={`px-3 py-1 rounded-md text-sm border ${rate === r ? "bg-brand-600 text-white border-brand-600" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"}`}
              >
                {r}%
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Mode</label>
            <select value={inclusive ? "inc" : "exc"} onChange={(e) => setInclusive(e.target.value === "inc")} className="input">
              <option value="exc">Exclusive (add tax)</option>
              <option value="inc">Inclusive (extract tax)</option>
            </select>
          </div>
          <div>
            <label className="label">Supply Type</label>
            <select value={intra ? "intra" : "inter"} onChange={(e) => setIntra(e.target.value === "intra")} className="input">
              <option value="intra">Intra-State (CGST + SGST)</option>
              <option value="inter">Inter-State (IGST)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-slate-900">Result</h2>
        <Row label="Base / Taxable Value" value={result.base} />
        {intra ? (
          <>
            <Row label={`CGST (${rate / 2}%)`} value={result.cgst} />
            <Row label={`SGST (${rate / 2}%)`} value={result.sgst} />
          </>
        ) : (
          <Row label={`IGST (${rate}%)`} value={result.igst} />
        )}
        <div className="border-t pt-2">
          <Row label={inclusive ? "Inclusive Total" : "Total (Base + Tax)"} value={result.total} bold />
        </div>
      </div>

      <DueDateCard />
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

function DueDateCard() {
  const [type, setType] = useState<"GSTR1" | "GSTR3B" | "GSTR9" | "GSTR2B">("GSTR3B");
  const [period, setPeriod] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [freq, setFreq] = useState<"MONTHLY" | "QUARTERLY">("MONTHLY");

  const due = useMemo(() => {
    try {
      let p = period;
      if (freq === "QUARTERLY") {
        const [y, m] = period.split("-").map(Number);
        const month = m;
        const q = month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 && month <= 12 ? 3 : 4;
        const yy = month >= 1 && month <= 3 ? y - 1 : y;
        p = `${yy}-Q${q}`;
      }
      if (type === "GSTR9") {
        const y = parseInt(period.slice(0, 4), 10);
        p = `FY${y - 1}-${y.toString().slice(2)}`;
      }
      const d = calculateDueDate(type, p, freq);
      return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return "—";
    }
  }, [type, period, freq]);

  return (
    <div className="card p-5 space-y-3 lg:col-span-2">
      <h2 className="font-semibold text-slate-900">Due Date Calculator</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="label">Return Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as "GSTR1" | "GSTR3B" | "GSTR9" | "GSTR2B")} className="input">
            <option value="GSTR1">GSTR-1</option>
            <option value="GSTR3B">GSTR-3B</option>
            <option value="GSTR2B">GSTR-2B</option>
            <option value="GSTR9">GSTR-9 (Annual)</option>
          </select>
        </div>
        <div>
          <label className="label">Period (month)</label>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Filing Frequency</label>
          <select value={freq} onChange={(e) => setFreq(e.target.value as "MONTHLY" | "QUARTERLY")} className="input" disabled={type === "GSTR9" || type === "GSTR2B"}>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly (QRMP)</option>
          </select>
        </div>
        <div className="flex items-end">
          <div className="w-full">
            <label className="label">Due Date</label>
            <div className="input bg-slate-50 font-semibold">{due}</div>
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500">Standard due dates per GST Act; doesn&apos;t account for govt notification extensions.</p>
    </div>
  );
}
