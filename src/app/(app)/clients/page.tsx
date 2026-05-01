import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/constants";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; type?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const where: Record<string, unknown> = {};
  if (params.q) {
    where.OR = [
      { legalName: { contains: params.q } },
      { tradeName: { contains: params.q } },
      { gstin: { contains: params.q.toUpperCase() } },
    ];
  }
  if (params.state) where.stateCode = params.state;
  if (params.type) where.registrationType = params.type;

  const clients = await prisma.client.findMany({
    where,
    orderBy: { legalName: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-600">{clients.length} client{clients.length === 1 ? "" : "s"}</p>
        </div>
        {can(user.role, "write") ? (
          <Link href="/clients/new" className="btn-primary">+ Add Client</Link>
        ) : null}
      </div>

      {params.error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{params.error}</div>
      ) : null}

      <div className="card p-4">
        <form className="flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search by name or GSTIN…"
            className="input flex-1 min-w-[200px]"
          />
          <input
            name="state"
            defaultValue={params.state ?? ""}
            placeholder="State code (e.g. 27)"
            className="input w-40"
            maxLength={2}
          />
          <select name="type" defaultValue={params.type ?? ""} className="input w-44">
            <option value="">All Reg. Types</option>
            <option value="REGULAR">Regular</option>
            <option value="COMPOSITION">Composition</option>
            <option value="SEZ">SEZ</option>
            <option value="CASUAL">Casual</option>
            <option value="ISD">ISD</option>
            <option value="TDS">TDS</option>
            <option value="TCS">TCS</option>
            <option value="NRTP">NRTP</option>
          </select>
          <button className="btn-secondary" type="submit">Filter</button>
          {(params.q || params.state || params.type) && (
            <Link href="/clients" className="btn-secondary">Reset</Link>
          )}
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Legal Name</th>
                <th>GSTIN</th>
                <th>State</th>
                <th>Reg. Type</th>
                <th>Frequency</th>
                <th>Turnover (Cr)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No clients yet. <Link href="/clients/new" className="text-brand-600 hover:underline">Add your first client</Link>.
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/clients/${c.id}`} className="font-medium text-brand-700 hover:underline">
                        {c.legalName}
                      </Link>
                      {c.tradeName ? <div className="text-xs text-slate-500">{c.tradeName}</div> : null}
                    </td>
                    <td className="font-mono text-xs">{c.gstin}</td>
                    <td>{c.state}</td>
                    <td>{c.registrationType}</td>
                    <td>{c.filingFrequency}</td>
                    <td>{c.turnoverCrore ?? "—"}</td>
                    <td>
                      {c.isActive ? <span className="badge-green">Active</span> : <span className="badge-gray">Inactive</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
