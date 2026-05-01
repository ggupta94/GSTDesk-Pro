"use client";

import { useState, useTransition } from "react";
import { upsertITCAction } from "./actions";
import { ITC_ELIGIBILITY } from "@/lib/constants";

type ClientLite = { id: string; legalName: string; hasCredentials: boolean };
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
  const [fetching, setFetching] = useState(false);
  const [fetchInfo, setFetchInfo] = useState<{
    stub: boolean;
    fetchedAt: string;
    note?: string;
  } | null>(null);
  const [fetchError, setFetchError] = useState<string>("");
  const [, startTransition] = useTransition();

  const selected = clients.find((c) => c.id === clientId);
  const credentialsOk = !!selected?.hasCredentials;

  async function fetchFromPortal() {
    setFetchError("");
    setFetchInfo(null);
    if (!clientId) {
      setFetchError("Choose a client first.");
      return;
    }
    if (!credentialsOk) {
      setFetchError("This client has no GST portal credentials saved. Add them on the client edit page first.");
      return;
    }
    setFetching(true);
    try {
      const r = await fetch(`/api/clients/${clientId}/fetch-itc?period=${encodeURIComponent(period)}`, {
        cache: "no-store",
      });
      const data = (await r.json()) as FetchResponse;
      if (!r.ok || !data.ok) {
        setFetchError(data.error ?? `Fetch failed (${r.status})`);
        return;
      }
      // Pre-fill the form
      setIgstAvail(String(data.igstAvailable ?? 0));
      setCgstAvail(String(data.cgstAvailable ?? 0));
      setSgstAvail(String(data.sgstAvailable ?? 0));
      setIgstUtil(String(data.igstUtilised ?? 0));
      setCgstUtil(String(data.cgstUtilised ?? 0));
      setSgstUtil(String(data.sgstUtilised ?? 0));
      if (data.eligibility) setEligibility(data.eligibility);
      if (data.blockedReason !== undefined) setBlockedReason(data.blockedReason);
      if (data.remarks !== undefined) setRemarks(data.remarks);
      setFetchInfo({
        stub: !!data.stub,
        fetchedAt: data.fetchedAt ?? new Date().toISOString(),
        note: data.note,
      });
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : "Network error");
    } finally {
      setFetching(false);
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
                {c.legalName} {c.hasCredentials ? "" : "· no creds"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Period *</label>
          <select name="period" value={period} onChange={(e) => setPeriod(e.target.value)} className="input" required>
            {periods.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
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
              <option key={e} value={e}>{e.replace("_", " ")}</option>
            ))}
          </select>
        </div>
      </div>

      {/* FETCH FROM PORTAL */}
      <div className="rounded-lg ring-1 ring-brand-200 bg-brand-50/40 p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-brand-600">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <div>
            <div className="font-medium text-slate-900">Auto-fill from GSTN portal</div>
            <div className="text-xs text-slate-600">
              {credentialsOk ? (
                <>Uses saved portal credentials for this client to fetch GSTR-2B.</>
              ) : selected ? (
                <span className="text-amber-700">This client has no portal credentials saved.</span>
              ) : (
                <>Choose a client + period, then click Fetch.</>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchFromPortal}
          disabled={fetching || !clientId}
          className="btn-secondary text-sm"
        >
          {fetching ? "Fetching…" : "Fetch from Portal"}
        </button>
      </div>

      {fetchInfo ? (
        <div
          className={`rounded-md px-3 py-2 text-sm ring-1 ${
            fetchInfo.stub
              ? "bg-amber-50 ring-amber-200 text-amber-800"
              : "bg-green-50 ring-green-200 text-green-800"
          }`}
        >
          <strong>{fetchInfo.stub ? "Stub mode:" : "Live:"}</strong>{" "}
          Fetched at {new Date(fetchInfo.fetchedAt).toLocaleString("en-IN")}.
          {fetchInfo.note ? <span className="block mt-0.5 text-xs opacity-80">{fetchInfo.note}</span> : null}
        </div>
      ) : null}
      {fetchError ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {fetchError}
        </div>
      ) : null}

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

      <div className="flex justify-end">
        <button className="btn-primary" type="submit">Save</button>
      </div>
    </form>
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
