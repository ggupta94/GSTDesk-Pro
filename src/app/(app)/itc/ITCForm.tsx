"use client";

import { useMemo, useState, useTransition } from "react";
import { upsertITCAction } from "./actions";
import { ITC_ELIGIBILITY } from "@/lib/constants";
import { parseGstr2bJson, type Gstr2bParseResult } from "@/lib/gstr2b";
import { calculateUtilisation } from "@/lib/itc-utilisation";

type ClientLite = {
  id: string;
  legalName: string;
  gstin: string;
  hasCredentials: boolean;
};
type Period = { value: string; label: string };

type FetchResponse = {
  ok: boolean;
  stub?: boolean;
  needsSetup?: boolean;
  error?: string;
  source?: "stub" | "gsp";
  fetchedAt?: string;
  igstAvailable?: number;
  cgstAvailable?: number;
  sgstAvailable?: number;
  igstUtilised?: number;
  cgstUtilised?: number;
  sgstUtilised?: number;
  eligibility?: string;
  blockedReason?: string;
  remarks?: string;
  note?: string;
};

export default function ITCForm({
  clients,
  periods,
  defaultPeriod,
  defaultClientId,
}: {
  clients: ClientLite[];
  periods: Period[];
  defaultPeriod: string;
  defaultClientId?: string;
}) {
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [period, setPeriod] = useState(defaultPeriod);
  const [eligibility, setEligibility] = useState<string>("FULLY_ELIGIBLE");
  const [blockedReason, setBlockedReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [igstAvail, setIgstAvail] = useState("0");
  const [cgstAvail, setCgstAvail] = useState("0");
  const [sgstAvail, setSgstAvail] = useState("0");
  const [igstUtil, setIgstUtil] = useState("0");
  const [cgstUtil, setCgstUtil] = useState("0");
  const [sgstUtil, setSgstUtil] = useState("0");

  const [busyJson, setBusyJson] = useState(false);
  const [busyFetch, setBusyFetch] = useState(false);
  const [busyOutput, setBusyOutput] = useState(false);
  const [info, setInfo] = useState<{ tone: "green" | "amber" | "red"; text: string; sub?: string } | null>(null);
  const [outputTax, setOutputTax] = useState<{
    igst: number;
    cgst: number;
    sgst: number;
    invoiceCount: number;
  } | null>(null);

  const [, startTransition] = useTransition();

  const selected = clients.find((c) => c.id === clientId);
  const credentialsOk = !!selected?.hasCredentials;

  // Live calculation: utilisation + cash payable + balance, recomputed
  // whenever Available or Output Tax change.
  const utilisation = useMemo(() => {
    return calculateUtilisation(
      {
        igst: parseFloat(igstAvail) || 0,
        cgst: parseFloat(cgstAvail) || 0,
        sgst: parseFloat(sgstAvail) || 0,
      },
      outputTax ?? { igst: 0, cgst: 0, sgst: 0 }
    );
  }, [igstAvail, cgstAvail, sgstAvail, outputTax]);

  async function autoFillUtilisation() {
    if (!clientId) {
      setInfo({ tone: "red", text: "Choose a client first." });
      return;
    }
    setBusyOutput(true);
    setInfo(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/output-tax?period=${encodeURIComponent(period)}`, {
        cache: "no-store",
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setInfo({ tone: "red", text: data.error ?? "Could not fetch output tax" });
        return;
      }
      setOutputTax({
        igst: data.igst,
        cgst: data.cgst,
        sgst: data.sgst,
        invoiceCount: data.invoiceCount,
      });
      // Apply utilisation directly to the Utilised inputs
      const u = calculateUtilisation(
        {
          igst: parseFloat(igstAvail) || 0,
          cgst: parseFloat(cgstAvail) || 0,
          sgst: parseFloat(sgstAvail) || 0,
        },
        { igst: data.igst, cgst: data.cgst, sgst: data.sgst }
      );
      setIgstUtil(u.utilised.igst.toFixed(2));
      setCgstUtil(u.utilised.cgst.toFixed(2));
      setSgstUtil(u.utilised.sgst.toFixed(2));
      if (data.invoiceCount === 0) {
        setInfo({
          tone: "amber",
          text: `No invoices found for this client in ${period}.`,
          sub: "Output tax is zero, so utilisation is also zero. Issue invoices first, then re-run.",
        });
      } else {
        setInfo({
          tone: "green",
          text: `Utilisation auto-calculated from ${data.invoiceCount} invoice${data.invoiceCount === 1 ? "" : "s"} in ${period} (Rule 88A).`,
          sub: `Output tax: IGST ₹${data.igst.toLocaleString("en-IN")} · CGST ₹${data.cgst.toLocaleString("en-IN")} · SGST ₹${data.sgst.toLocaleString("en-IN")}`,
        });
      }
    } catch (e: unknown) {
      setInfo({ tone: "red", text: e instanceof Error ? e.message : "Network error" });
    } finally {
      setBusyOutput(false);
    }
  }

  function applyParsed(result: Gstr2bParseResult, sourceLabel: string) {
    if (!result.ok) {
      setInfo({
        tone: "red",
        text: result.error,
        sub: result.diagnostic,
      });
      return;
    }
    if (selected && result.gstin !== selected.gstin) {
      setInfo({
        tone: "red",
        text: `GSTIN mismatch: file is for ${result.gstin}, but you selected ${selected.legalName} (${selected.gstin}). Pick the right client.`,
      });
      return;
    }
    setIgstAvail(result.igstAvailable.toFixed(2));
    setCgstAvail(result.cgstAvailable.toFixed(2));
    setSgstAvail(result.sgstAvailable.toFixed(2));
    setEligibility(result.eligibility);
    if (result.blockedReason) setBlockedReason(result.blockedReason);
    setPeriod(result.period);
    const total = result.igstAvailable + result.cgstAvailable + result.sgstAvailable;
    const totalBlocked = result.igstBlocked + result.cgstBlocked + result.sgstBlocked;
    setInfo({
      tone: total === 0 && totalBlocked === 0 ? "amber" : "green",
      text:
        total === 0 && totalBlocked === 0
          ? `${sourceLabel} loaded · ${result.periodLabel} · GSTIN ${result.gstin} — but no ITC amounts found in the file`
          : `${sourceLabel} loaded · ${result.periodLabel} · GSTIN ${result.gstin}`,
      sub:
        total === 0 && totalBlocked === 0
          ? `${result.diagnostic} — if you see ITC on the portal, send me the diagnostic line so I can adjust the parser.`
          : `Available: IGST ₹${result.igstAvailable.toFixed(0)} · CGST ₹${result.cgstAvailable.toFixed(0)} · SGST ₹${result.sgstAvailable.toFixed(0)}${totalBlocked > 0 ? ` · Blocked total ₹${totalBlocked.toFixed(0)}` : ""}`,
    });
  }

  async function onJsonUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusyJson(true);
    setInfo(null);
    try {
      const text = await file.text();
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        setInfo({ tone: "red", text: "Could not parse the file as JSON." });
        return;
      }
      applyParsed(parseGstr2bJson(raw), `GSTR-2B JSON (${file.name})`);
    } finally {
      setBusyJson(false);
      e.target.value = ""; // allow re-uploading same file
    }
  }

  async function fetchFromPortal() {
    if (!clientId) {
      setInfo({ tone: "red", text: "Choose a client first." });
      return;
    }
    if (!credentialsOk) {
      setInfo({
        tone: "red",
        text: "This client has no GST portal credentials saved. Add them on the client edit page first.",
      });
      return;
    }
    setBusyFetch(true);
    setInfo(null);
    try {
      const r = await fetch(
        `/api/clients/${clientId}/fetch-itc?period=${encodeURIComponent(period)}`,
        { cache: "no-store" }
      );
      const data = (await r.json()) as FetchResponse;
      if (!r.ok || !data.ok) {
        setInfo({ tone: "red", text: data.error ?? `Fetch failed (${r.status})` });
        return;
      }
      setIgstAvail(String(data.igstAvailable ?? 0));
      setCgstAvail(String(data.cgstAvailable ?? 0));
      setSgstAvail(String(data.sgstAvailable ?? 0));
      setIgstUtil(String(data.igstUtilised ?? 0));
      setCgstUtil(String(data.cgstUtilised ?? 0));
      setSgstUtil(String(data.sgstUtilised ?? 0));
      if (data.eligibility) setEligibility(data.eligibility);
      if (data.blockedReason !== undefined) setBlockedReason(data.blockedReason);
      if (data.remarks !== undefined) setRemarks(data.remarks);
      setInfo({
        tone: data.stub ? "amber" : "green",
        text: data.stub
          ? `Stub data loaded (no GSP wired) · ${new Date(data.fetchedAt ?? Date.now()).toLocaleString("en-IN")}`
          : `Live GSP fetch · ${new Date(data.fetchedAt ?? Date.now()).toLocaleString("en-IN")}`,
        sub: data.note,
      });
    } catch (e: unknown) {
      setInfo({ tone: "red", text: e instanceof Error ? e.message : "Network error" });
    } finally {
      setBusyFetch(false);
    }
  }

  function submit(formData: FormData) {
    startTransition(() => upsertITCAction(formData));
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="label">Client *</label>
          <select
            name="clientId"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="input"
            required
          >
            <option value="">— Select —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legalName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Period *</label>
          <select
            name="period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="input"
            required
          >
            {periods.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Eligibility *</label>
          <select
            name="eligibility"
            value={eligibility}
            onChange={(e) => setEligibility(e.target.value)}
            className="input"
            required
          >
            {ITC_ELIGIBILITY.map((e) => (
              <option key={e} value={e}>
                {e.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* AUTO-FILL OPTIONS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Option A — JSON upload (primary, free) */}
        <div className="rounded-lg ring-2 ring-brand-300 bg-brand-50/40 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <polyline points="9 15 12 12 15 15" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">Upload GSTR-2B JSON</h3>
                <span className="badge-green text-[10px]">Recommended</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                Free. Download the JSON from gst.gov.in → Returns → GSTR-2B → <em>Download</em> →{" "}
                <em>Generate JSON</em>, then upload it here.
              </p>
              <div className="mt-2">
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                  <span
                    className={`btn-primary ${busyJson ? "opacity-60 pointer-events-none" : ""}`}
                  >
                    {busyJson ? "Parsing…" : "Choose JSON file"}
                  </span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={onJsonUpload}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Option B — GSP fetch (secondary, requires subscription) */}
        <div className="rounded-lg ring-1 ring-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-600 text-white">
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-slate-900">Fetch via GSP API</h3>
                <span className="badge-gray text-[10px]">Needs subscription</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                {credentialsOk ? (
                  <>Uses saved portal credentials. Active when GSP env vars are set.</>
                ) : selected ? (
                  <span className="text-amber-700">No portal credentials saved for this client.</span>
                ) : (
                  <>Pick a client + period first.</>
                )}
              </p>
              <div className="mt-2">
                <button
                  type="button"
                  onClick={fetchFromPortal}
                  disabled={busyFetch || !clientId}
                  className="btn-secondary text-sm"
                >
                  {busyFetch ? "Fetching…" : "Fetch via GSP"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {info ? (
        <div
          className={`rounded-md px-3 py-2 text-sm ring-1 ${
            info.tone === "green"
              ? "bg-green-50 text-green-800 ring-green-200"
              : info.tone === "amber"
                ? "bg-amber-50 text-amber-800 ring-amber-200"
                : "bg-red-50 text-red-800 ring-red-200"
          }`}
        >
          <div>{info.text}</div>
          {info.sub ? <div className="mt-0.5 text-xs opacity-80">{info.sub}</div> : null}
        </div>
      ) : null}

      {/* AUTO-CALCULATE UTILISATION */}
      <div className="rounded-lg ring-2 ring-indigo-300 bg-indigo-50/40 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="8" y1="12" x2="8" y2="12" />
              <line x1="12" y1="12" x2="12" y2="12" />
              <line x1="16" y1="12" x2="16" y2="12" />
              <line x1="8" y1="16" x2="8" y2="16" />
              <line x1="12" y1="16" x2="12" y2="16" />
              <line x1="16" y1="16" x2="16" y2="16" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">Auto-calculate Utilisation</h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Pulls output tax from this month&apos;s invoices and applies Rule 88A
              (IGST credit consumed first, then CGST/SGST). Fills the Utilised fields below.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={autoFillUtilisation}
          disabled={busyOutput || !clientId}
          className="btn-secondary text-sm"
        >
          {busyOutput ? "Calculating…" : "Calculate Utilisation"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <NumInput name="igstAvailable" label="IGST Available" value={igstAvail} onChange={setIgstAvail} />
        <NumInput name="cgstAvailable" label="CGST Available" value={cgstAvail} onChange={setCgstAvail} />
        <NumInput name="sgstAvailable" label="SGST Available" value={sgstAvail} onChange={setSgstAvail} />
        <NumInput name="igstUtilised" label="IGST Utilised" value={igstUtil} onChange={setIgstUtil} />
        <NumInput name="cgstUtilised" label="CGST Utilised" value={cgstUtil} onChange={setCgstUtil} />
        <NumInput name="sgstUtilised" label="SGST Utilised" value={sgstUtil} onChange={setSgstUtil} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Blocked Reason (if any)</label>
          <input
            name="blockedReason"
            value={blockedReason}
            onChange={(e) => setBlockedReason(e.target.value)}
            className="input"
            placeholder="e.g. Rule 38 — non-resident supplier"
          />
        </div>
        <div>
          <label className="label">Remarks</label>
          <input
            name="remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="input"
          />
        </div>
      </div>

      {/* LIVE CALCULATION SUMMARY */}
      <div className="card p-4 bg-slate-50/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">GST Liability — This Period</h3>
          {outputTax ? (
            <span className="text-xs text-slate-500">
              Based on {outputTax.invoiceCount} invoice{outputTax.invoiceCount === 1 ? "" : "s"} in {period}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Click &ldquo;Calculate Utilisation&rdquo; for live numbers</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"></th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">IGST</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">CGST</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">SGST</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <SummaryRow
                label="Output Tax (Liability)"
                igst={outputTax?.igst ?? 0}
                cgst={outputTax?.cgst ?? 0}
                sgst={outputTax?.sgst ?? 0}
              />
              <SummaryRow
                label="ITC Available"
                igst={parseFloat(igstAvail) || 0}
                cgst={parseFloat(cgstAvail) || 0}
                sgst={parseFloat(sgstAvail) || 0}
              />
              <SummaryRow
                label="ITC Utilised"
                igst={utilisation.utilised.igst}
                cgst={utilisation.utilised.cgst}
                sgst={utilisation.utilised.sgst}
                tone="indigo"
              />
              <SummaryRow
                label="Cash Payable"
                igst={utilisation.cashPayable.igst}
                cgst={utilisation.cashPayable.cgst}
                sgst={utilisation.cashPayable.sgst}
                tone="red"
                bold
              />
              <SummaryRow
                label="Carry-forward Balance"
                igst={utilisation.balance.igst}
                cgst={utilisation.balance.cgst}
                sgst={utilisation.balance.sgst}
                tone="green"
              />
            </tbody>
          </table>
        </div>
        {utilisation.total.cashPayable > 0 ? (
          <p className="mt-2 text-xs text-slate-600">
            <strong>Net cash to deposit in challan:</strong>{" "}
            <span className="text-red-700 font-mono">₹ {utilisation.total.cashPayable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
          </p>
        ) : (
          outputTax && outputTax.invoiceCount > 0 ? (
            <p className="mt-2 text-xs text-green-700">
              ✓ All output tax can be paid from credit. No cash payable.
            </p>
          ) : null
        )}
      </div>

      <div className="flex justify-end">
        <button className="btn-primary" type="submit">
          Save
        </button>
      </div>
    </form>
  );
}

function SummaryRow({
  label,
  igst,
  cgst,
  sgst,
  tone,
  bold,
}: {
  label: string;
  igst: number;
  cgst: number;
  sgst: number;
  tone?: "indigo" | "red" | "green";
  bold?: boolean;
}) {
  const toneCls =
    tone === "red"
      ? "text-red-700"
      : tone === "green"
        ? "text-green-700"
        : tone === "indigo"
          ? "text-indigo-700"
          : "text-slate-700";
  const total = igst + cgst + sgst;
  const fmt = (n: number) =>
    n === 0 ? "—" : `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return (
    <tr>
      <td className="px-3 py-2 text-slate-600">{label}</td>
      <td className={`px-3 py-2 text-right font-mono ${toneCls} ${bold ? "font-semibold" : ""}`}>
        {fmt(igst)}
      </td>
      <td className={`px-3 py-2 text-right font-mono ${toneCls} ${bold ? "font-semibold" : ""}`}>
        {fmt(cgst)}
      </td>
      <td className={`px-3 py-2 text-right font-mono ${toneCls} ${bold ? "font-semibold" : ""}`}>
        {fmt(sgst)}
      </td>
      <td className={`px-3 py-2 text-right font-mono font-semibold ${toneCls}`}>{fmt(total)}</td>
    </tr>
  );
}

function NumInput({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        name={name}
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      />
    </div>
  );
}
