import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, RETURN_TYPES, RETURN_STATUS } from "@/lib/constants";
import { formatPeriodLabel, listRecentMonthlyPeriods, currentMonthlyPeriod } from "@/lib/gst";
import {
  createReturnAction,
  markFiledAction,
  deleteReturnAction,
  refreshStatusesAction,
} from "./actions";

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; client?: string; error?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const where: Record<string, unknown> = {};
  if (sp.status && (RETURN_STATUS as readonly string[]).includes(sp.status)) where.status = sp.status;
  if (sp.type && (RETURN_TYPES as readonly string[]).includes(sp.type)) where.type = sp.type;
  if (sp.client) where.clientId = sp.client;

  const [returns, clients] = await Promise.all([
    prisma.return.findMany({
      where,
      include: { client: true, filedBy: true },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 200,
    }),
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { legalName: "asc" },
      select: { id: true, legalName: true, gstin: true, filingFrequency: true },
    }),
  ]);

  const periods = listRecentMonthlyPeriods(12);
  const defaultPeriod = currentMonthlyPeriod();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">GST Return Tracker</h1>
          <p className="text-sm text-slate-600">Track GSTR-1, 3B, 9, 2B per client</p>
        </div>
        <form action={refreshStatusesAction}>
          <button className="btn-secondary text-sm" type="submit" title="Recompute Pending → Overdue based on today">
            Refresh Statuses
          </button>
        </form>
      </div>

      {sp.error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{sp.error}</div>
      ) : null}

      <div className="card p-4">
        <form className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue={sp.status ?? ""} className="input">
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="OVERDUE">Overdue</option>
              <option value="FILED">Filed</option>
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select name="type" defaultValue={sp.type ?? ""} className="input">
              <option value="">All</option>
              {RETURN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="label">Client</label>
            <select name="client" defaultValue={sp.client ?? ""} className="input">
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
            </select>
          </div>
          <button className="btn-secondary" type="submit">Filter</button>
          {(sp.status || sp.type || sp.client) && <Link href="/returns" className="btn-secondary">Reset</Link>}
        </form>
      </div>

      {can(user.role, "write") ? (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Add Return</h2>
          <form action={createReturnAction} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="label">Client *</label>
              <select name="clientId" className="input" required>
                <option value="">— Select —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type *</label>
              <select name="type" className="input" required>
                {RETURN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Period *</label>
              <select name="period" defaultValue={defaultPeriod} className="input" required>
                {periods.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <button className="btn-primary" type="submit">Add</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Due date is auto-calculated from type, period and client filing frequency.</p>
        </div>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Client</th>
                <th>Type</th>
                <th>Period</th>
                <th>Due</th>
                <th>Status</th>
                <th>Filed</th>
                <th>ARN</th>
                {can(user.role, "write") ? <th className="text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returns.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-500">No returns match.</td></tr>
              ) : (
                returns.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">
                      <Link href={`/clients/${r.clientId}`} className="text-brand-700 hover:underline">{r.client.legalName}</Link>
                    </td>
                    <td>{r.type}</td>
                    <td>{formatPeriodLabel(r.period)}</td>
                    <td>{format(r.dueDate, "dd MMM yyyy")}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{r.filedAt ? format(r.filedAt, "dd MMM yyyy") : "—"}</td>
                    <td className="font-mono text-xs">{r.arn ?? "—"}</td>
                    {can(user.role, "write") ? (
                      <td className="text-right space-x-1">
                        {r.status !== "FILED" ? (
                          <form action={markFiledAction} className="inline-flex items-center gap-1">
                            <input type="hidden" name="id" value={r.id} />
                            <input name="arn" placeholder="ARN" className="input py-1 px-2 text-xs w-32" />
                            <button className="btn-secondary text-xs py-1 px-2" type="submit">Mark Filed</button>
                          </form>
                        ) : null}
                        {can(user.role, "delete") ? (
                          <form action={deleteReturnAction} className="inline">
                            <input type="hidden" name="id" value={r.id} />
                            <button className="text-red-600 hover:underline text-xs" type="submit">Delete</button>
                          </form>
                        ) : null}
                      </td>
                    ) : null}
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

function StatusBadge({ status }: { status: string }) {
  if (status === "FILED") return <span className="badge-green">Filed</span>;
  if (status === "OVERDUE") return <span className="badge-red">Overdue</span>;
  return <span className="badge-amber">Pending</span>;
}
