import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { format } from "date-fns";
import { formatPeriodLabel } from "@/lib/gst";
import { markFiledAction } from "../returns/actions";

export default async function DashboardPage() {
  await requireUser();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [clientCount, pendingCount, filedCount, overdueCount, itcAgg, overdueReturns, upcomingReturns, recentFilings] =
    await Promise.all([
      prisma.client.count({ where: { isActive: true } }),
      prisma.return.count({ where: { status: "PENDING" } }),
      prisma.return.count({ where: { status: "FILED" } }),
      prisma.return.count({ where: { status: "PENDING", dueDate: { lt: now } } }),
      prisma.iTCRecord.aggregate({
        _sum: { igstAvailable: true, cgstAvailable: true, sgstAvailable: true },
      }),
      prisma.return.findMany({
        where: { status: "PENDING", dueDate: { lt: now } },
        include: { client: true },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      prisma.return.findMany({
        where: { status: "PENDING", dueDate: { gte: now, lte: monthEnd } },
        include: { client: true },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      prisma.return.findMany({
        where: { status: "FILED" },
        include: { client: true, filedBy: true },
        orderBy: { filedAt: "desc" },
        take: 10,
      }),
    ]);

  const totalItcPool =
    (itcAgg._sum.igstAvailable ?? 0) + (itcAgg._sum.cgstAvailable ?? 0) + (itcAgg._sum.sgstAvailable ?? 0);
  void monthStart;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600">{format(now, "EEEE, dd MMM yyyy")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric title="Active Clients" value={clientCount} href="/clients" tone="blue" />
        <Metric title="Pending Returns" value={pendingCount} href="/returns?status=PENDING" tone="amber" />
        <Metric title="Filed (all-time)" value={filedCount} href="/returns?status=FILED" tone="green" />
        <Metric title="Total ITC Pool" value={`₹ ${totalItcPool.toLocaleString("en-IN")}`} href="/itc" tone="indigo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Overdue Returns</h2>
            <span className="badge-red">{overdueCount}</span>
          </div>
          <div className="overflow-x-auto">
            {overdueReturns.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No overdue returns.</p>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Type</th>
                    <th>Period</th>
                    <th>Due</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overdueReturns.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.client.legalName}</td>
                      <td>{r.type}</td>
                      <td>{formatPeriodLabel(r.period)}</td>
                      <td className="text-red-700">{format(r.dueDate, "dd MMM yyyy")}</td>
                      <td className="text-right">
                        <form action={markFiledAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="btn-secondary text-xs py-1 px-2" type="submit">
                            Mark Filed
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Upcoming Due Dates (this month)</h2>
          </div>
          <div className="overflow-x-auto">
            {upcomingReturns.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Nothing due this month.</p>
            ) : (
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Type</th>
                    <th>Period</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {upcomingReturns.map((r) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.client.legalName}</td>
                      <td>{r.type}</td>
                      <td>{formatPeriodLabel(r.period)}</td>
                      <td>{format(r.dueDate, "dd MMM yyyy")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Recent Filings</h2>
        </div>
        <div className="overflow-x-auto">
          {recentFilings.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No filings recorded yet.</p>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Filed On</th>
                  <th>ARN</th>
                  <th>Filed By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentFilings.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.client.legalName}</td>
                    <td>{r.type}</td>
                    <td>{formatPeriodLabel(r.period)}</td>
                    <td>{r.filedAt ? format(r.filedAt, "dd MMM yyyy") : "—"}</td>
                    <td className="font-mono text-xs">{r.arn ?? "—"}</td>
                    <td>{r.filedBy?.fullName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  title,
  value,
  href,
  tone,
}: {
  title: string;
  value: number | string;
  href: string;
  tone: "blue" | "amber" | "green" | "indigo";
}) {
  const tones: Record<string, string> = {
    blue: "from-blue-500 to-blue-600",
    amber: "from-amber-500 to-amber-600",
    green: "from-green-500 to-green-600",
    indigo: "from-indigo-500 to-indigo-600",
  };
  return (
    <Link href={href} className="card p-4 block hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <span className={`inline-block h-2 w-12 rounded-full bg-gradient-to-r ${tones[tone]}`} />
      </div>
    </Link>
  );
}
