import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/constants";
import { formatPeriodLabel, listRecentMonthlyPeriods, currentMonthlyPeriod } from "@/lib/gst";
import { deleteITCAction } from "./actions";
import ITCForm from "./ITCForm";

export default async function ITCPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; error?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const where: Record<string, unknown> = {};
  if (sp.client) where.clientId = sp.client;

  const [records, clients] = await Promise.all([
    prisma.iTCRecord.findMany({
      where,
      include: { client: true },
      orderBy: [{ period: "desc" }, { client: { legalName: "asc" } }],
      take: 200,
    }),
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { legalName: "asc" },
      select: {
        id: true,
        legalName: true,
        gstPortalUsername: true,
        gstPortalPasswordEnc: true,
      },
    }),
  ]);

  const periods = listRecentMonthlyPeriods(12);
  const defaultPeriod = currentMonthlyPeriod();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ITC Tracker</h1>
        <p className="text-sm text-slate-600">Client-wise IGST / CGST / SGST input tax credit</p>
      </div>

      {sp.error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{sp.error}</div>
      ) : null}

      <div className="card p-4">
        <form className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="label">Filter by client</label>
            <select name="client" defaultValue={sp.client ?? ""} className="input">
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
            </select>
          </div>
          <button className="btn-secondary" type="submit">Apply</button>
          {sp.client && <Link href="/itc" className="btn-secondary">Reset</Link>}
        </form>
      </div>

      {can(user.role, "write") ? (
        <details className="card p-5" open={!!sp.client}>
          <summary className="cursor-pointer font-semibold text-slate-900">+ Add / Update ITC entry</summary>
          <div className="mt-4">
            <ITCForm
              clients={clients.map((c) => ({
                id: c.id,
                legalName: c.legalName,
                hasCredentials: !!(c.gstPortalUsername && c.gstPortalPasswordEnc),
              }))}
              periods={periods}
              defaultPeriod={defaultPeriod}
              defaultClientId={sp.client}
            />
          </div>
        </details>
      ) : null}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Client</th>
                <th>Period</th>
                <th>Available</th>
                <th>Utilised</th>
                <th>Balance</th>
                <th>Util %</th>
                <th>Eligibility</th>
                {can(user.role, "delete") ? <th></th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-slate-500">No ITC entries.</td></tr>
              ) : (
                records.map((r) => {
                  const totalAvail = r.igstAvailable + r.cgstAvailable + r.sgstAvailable;
                  const totalUtil = r.igstUtilised + r.cgstUtilised + r.sgstUtilised;
                  const balance = totalAvail - totalUtil;
                  const pct = totalAvail > 0 ? Math.min(100, Math.round((totalUtil / totalAvail) * 100)) : 0;
                  return (
                    <tr key={r.id}>
                      <td className="font-medium">
                        <Link href={`/clients/${r.clientId}`} className="text-brand-700 hover:underline">{r.client.legalName}</Link>
                      </td>
                      <td>{formatPeriodLabel(r.period)}</td>
                      <td>
                        <div>₹ {totalAvail.toLocaleString("en-IN")}</div>
                        <div className="text-xs text-slate-500">I {r.igstAvailable.toLocaleString("en-IN")} / C {r.cgstAvailable.toLocaleString("en-IN")} / S {r.sgstAvailable.toLocaleString("en-IN")}</div>
                      </td>
                      <td>
                        <div>₹ {totalUtil.toLocaleString("en-IN")}</div>
                        <div className="text-xs text-slate-500">I {r.igstUtilised.toLocaleString("en-IN")} / C {r.cgstUtilised.toLocaleString("en-IN")} / S {r.sgstUtilised.toLocaleString("en-IN")}</div>
                      </td>
                      <td className="font-semibold">₹ {balance.toLocaleString("en-IN")}</td>
                      <td className="w-40">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                            <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs">{pct}%</span>
                        </div>
                      </td>
                      <td>
                        <EligibilityBadge value={r.eligibility} />
                        {r.blockedReason ? <div className="text-xs text-slate-500 mt-0.5">{r.blockedReason}</div> : null}
                      </td>
                      {can(user.role, "delete") ? (
                        <td>
                          <form action={deleteITCAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className="text-red-600 hover:underline text-xs" type="submit">Delete</button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EligibilityBadge({ value }: { value: string }) {
  if (value === "FULLY_ELIGIBLE") return <span className="badge-green">Fully Eligible</span>;
  if (value === "PARTIALLY_BLOCKED") return <span className="badge-amber">Partially Blocked</span>;
  return <span className="badge-red">Blocked</span>;
}
