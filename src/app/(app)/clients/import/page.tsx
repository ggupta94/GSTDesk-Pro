import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/constants";
import ImportClient from "./ImportClient";

export default async function ImportClientsPage() {
  const user = await requireUser();
  if (!can(user.role, "write")) redirect("/clients");

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Import Clients from Excel</h1>
          <p className="text-sm text-slate-600">Bulk-create clients from an XLSX spreadsheet.</p>
        </div>
        <Link href="/clients" className="btn-secondary">Back to Clients</Link>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Step 1 — Download the template</h2>
        <p className="text-sm text-slate-700">
          Use our template so the column headers line up. The sheet has 15 columns; only{" "}
          <strong>Legal Name</strong> and <strong>GSTIN</strong> are required. PAN and state are
          auto-derived from each GSTIN.
        </p>
        <a href="/api/clients/import/template" className="btn-primary inline-flex w-fit">
          Download Template (.xlsx)
        </a>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-slate-900">Step 2 — Upload filled file</h2>
        <ImportClient />
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-slate-900 mb-2">Notes</h2>
        <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
          <li>The first sheet (or the sheet named &ldquo;Clients&rdquo;) is read.</li>
          <li>Header names are matched flexibly — case-insensitive, parens and asterisks are ignored.</li>
          <li>Each GSTIN is validated (state code + PAN + checksum). Invalid rows are reported, not imported.</li>
          <li>Duplicate GSTINs (already in your client list) are skipped, never overwritten.</li>
          <li>You can re-upload the same file safely — already-imported rows will be skipped.</li>
          <li>Max file size: 10&nbsp;MB.</li>
        </ul>
      </div>
    </div>
  );
}
