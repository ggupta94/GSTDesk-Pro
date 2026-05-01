"use client";

import { useState } from "react";
import { importClientsAction, type ImportResult } from "./actions";

export default function ImportClient() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setResult({ ok: false, total: 0, imported: 0, skipped: 0, errors: 0, rows: [], fatal: "Choose an .xlsx file first" });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await importClientsAction(fd);
      setResult(r);
    } catch (err: unknown) {
      setResult({
        ok: false,
        total: 0,
        imported: 0,
        skipped: 0,
        errors: 0,
        rows: [],
        fatal: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            className="block text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
            required
          />
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "Importing…" : "Upload & Import"}
          </button>
        </div>
        {fileName ? <p className="text-xs text-slate-500">Selected: {fileName}</p> : null}
      </form>

      {result ? (
        <div className="mt-5 space-y-3">
          {result.fatal ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
              {result.fatal}
            </div>
          ) : null}

          {result.ok ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Total Rows" value={result.total} tone="gray" />
                <Stat label="Imported" value={result.imported} tone="green" />
                <Stat label="Skipped" value={result.skipped} tone="amber" />
                <Stat label="Errors" value={result.errors} tone="red" />
              </div>
              {result.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="table-base mt-2">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Legal Name</th>
                        <th>GSTIN</th>
                        <th>Status</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.rows.map((r) => (
                        <tr key={r.rowNumber}>
                          <td>{r.rowNumber}</td>
                          <td className="max-w-xs truncate">{r.legalName}</td>
                          <td className="font-mono text-xs">{r.gstin}</td>
                          <td>
                            {r.status === "imported" && <span className="badge-green">Imported</span>}
                            {r.status === "skipped" && <span className="badge-amber">Skipped</span>}
                            {r.status === "error" && <span className="badge-red">Error</span>}
                          </td>
                          <td className="text-xs text-slate-600 max-w-md whitespace-normal">{r.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {result.imported > 0 ? (
                <a href="/clients" className="btn-secondary inline-flex w-fit">View imported clients →</a>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "gray" | "green" | "amber" | "red" }) {
  const tones = {
    gray: "bg-slate-50 text-slate-700",
    green: "bg-green-50 text-green-800",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-800",
  } as const;
  return (
    <div className={`rounded-md px-3 py-2 ${tones[tone]}`}>
      <div className="text-xs uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
