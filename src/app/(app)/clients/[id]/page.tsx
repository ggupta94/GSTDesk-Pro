import Link from "next/link";
import { notFound } from "next/navigation";
import { format, startOfMonth, subMonths } from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/constants";
import { formatPeriodLabel } from "@/lib/gst";
import { deleteClientAction } from "../actions";
import { decryptSecret } from "@/lib/crypto";
import { calculateUtilisation } from "@/lib/itc-utilisation";
import PortalCredentials from "./PortalCredentials";

function fyStart(d: Date = new Date()) {
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(year, 3, 1);
}
function fyEnd(d: Date = new Date()) {
  const start = fyStart(d);
  return new Date(start.getFullYear() + 1, 2, 31, 23, 59, 59);
}
function fyLabel(d: Date = new Date()) {
  const y = fyStart(d).getFullYear();
  return `FY ${y}-${(y + 1).toString().slice(2)}`;
}
function inr(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const now = new Date();
  const FYstart = fyStart(now);
  const FYend = fyEnd(now);
  const last12Start = startOfMonth(subMonths(now, 11));

  const [
    fyInvoices,
    last12Invoices,
    invoiceTotalAgg,
    fyTaxAgg,
    recentInvoices,
    returnsByStatus,
    recentReturns,
    itcRecords,
    itcAgg,
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: { clientId: id, invoiceDate: { gte: FYstart, lte: FYend } },
      select: { grandTotal: true, subTotal: true, totalCgst: true, totalSgst: true, totalIgst: true },
    }),
    prisma.invoice.findMany({
      where: { clientId: id, invoiceDate: { gte: last12Start } },
      select: { invoiceDate: true, grandTotal: true, totalIgst: true, totalCgst: true, totalSgst: true },
      orderBy: { invoiceDate: "asc" },
    }),
    prisma.invoice.aggregate({
      where: { clientId: id },
      _sum: { grandTotal: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { clientId: id, invoiceDate: { gte: FYstart, lte: FYend } },
      _sum: { totalCgst: true, totalSgst: true, totalIgst: true },
    }),
    prisma.invoice.findMany({
      where: { clientId: id },
      orderBy: { invoiceDate: "desc" },
      take: 6,
    }),
    prisma.return.groupBy({
      by: ["status"],
      where: { clientId: id },
      _count: true,
    }),
    prisma.return.findMany({
      where: { clientId: id },
      orderBy: { dueDate: "desc" },
      take: 8,
      include: { filedBy: true },
    }),
    prisma.iTCRecord.findMany({
      where: { clientId: id },
      orderBy: { period: "desc" },
      take: 12,
    }),
    prisma.iTCRecord.aggregate({
      where: { clientId: id },
      _sum: {
        igstAvailable: true,
        cgstAvailable: true,
        sgstAvailable: true,
        igstUtilised: true,
        cgstUtilised: true,
        sgstUtilised: true,
      },
    }),
  ]);

  // ─── derived metrics ───
  const fyTurnover = fyInvoices.reduce((s, i) => s + i.grandTotal, 0);
  const fyTaxableValue = fyInvoices.reduce((s, i) => s + i.subTotal, 0);
  const fyOutputTax =
    (fyTaxAgg._sum.totalCgst ?? 0) + (fyTaxAgg._sum.totalSgst ?? 0) + (fyTaxAgg._sum.totalIgst ?? 0);
  const lifetimeTurnover = invoiceTotalAgg._sum.grandTotal ?? 0;
  const lifetimeInvoiceCount = invoiceTotalAgg._count._all;

  // monthly buckets for last 12 months (oldest -> newest) — turnover + tax liability
  const monthlyBuckets: {
    key: string;
    label: string;
    total: number;
    igstLi: number;
    cgstLi: number;
    sgstLi: number;
  }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(now, i);
    monthlyBuckets.push({
      key: format(d, "yyyy-MM"),
      label: format(d, "MMM''yy"),
      total: 0,
      igstLi: 0,
      cgstLi: 0,
      sgstLi: 0,
    });
  }
  for (const inv of last12Invoices) {
    const k = format(inv.invoiceDate, "yyyy-MM");
    const b = monthlyBuckets.find((x) => x.key === k);
    if (b) {
      b.total += inv.grandTotal;
      b.igstLi += inv.totalIgst;
      b.cgstLi += inv.totalCgst;
      b.sgstLi += inv.totalSgst;
    }
  }
  const maxMonthly = Math.max(1, ...monthlyBuckets.map((b) => b.total));

  // Build month-wise GST liability summary (newest -> oldest) by joining
  // the monthly invoice buckets with ITC records for the same period.
  const itcByPeriod = new Map(itcRecords.map((r) => [r.period, r]));
  const liabilityRows = [...monthlyBuckets]
    .reverse()
    .map((b) => {
      const itc = itcByPeriod.get(b.key);
      const available = {
        igst: itc?.igstAvailable ?? 0,
        cgst: itc?.cgstAvailable ?? 0,
        sgst: itc?.sgstAvailable ?? 0,
      };
      const liability = { igst: b.igstLi, cgst: b.cgstLi, sgst: b.sgstLi };
      const u = calculateUtilisation(available, liability);
      return {
        period: b.key,
        label: b.label,
        outputTotal: b.igstLi + b.cgstLi + b.sgstLi,
        availableTotal: available.igst + available.cgst + available.sgst,
        utilisedTotal: u.total.utilised,
        cashPayable: u.total.cashPayable,
        balanceTotal: u.total.balance,
        hasInvoices: b.igstLi + b.cgstLi + b.sgstLi > 0,
        hasITC: !!itc,
      };
    })
    .filter((r) => r.hasInvoices || r.hasITC);
  const totalCashPayable = liabilityRows.reduce((s, r) => s + r.cashPayable, 0);

  // ITC totals
  const itcAvail =
    (itcAgg._sum.igstAvailable ?? 0) + (itcAgg._sum.cgstAvailable ?? 0) + (itcAgg._sum.sgstAvailable ?? 0);
  const itcUtil =
    (itcAgg._sum.igstUtilised ?? 0) + (itcAgg._sum.cgstUtilised ?? 0) + (itcAgg._sum.sgstUtilised ?? 0);
  const itcBalance = itcAvail - itcUtil;
  const itcUtilPct = itcAvail > 0 ? Math.min(100, Math.round((itcUtil / itcAvail) * 100)) : 0;

  // ITC mismatch: utilised > available is a hard violation; partially-blocked / blocked periods are flags
  const blockedPeriods = itcRecords.filter((r) => r.eligibility !== "FULLY_ELIGIBLE");
  const overUtilised = itcUtil > itcAvail + 0.5;
  const itcDeclaredVsOutput = fyOutputTax - itcUtil; // net tax payable approximation

  // returns counters
  const filedCount = returnsByStatus.find((g) => g.status === "FILED")?._count ?? 0;
  const pendingCount = returnsByStatus.find((g) => g.status === "PENDING")?._count ?? 0;
  const overdueCount = returnsByStatus.find((g) => g.status === "OVERDUE")?._count ?? 0;
  const totalReturns = filedCount + pendingCount + overdueCount;
  const compliancePct = totalReturns > 0 ? Math.round((filedCount / totalReturns) * 100) : 100;

  // declared turnover comparison (Cr -> Rs)
  const declaredAnnual = client.turnoverCrore ? client.turnoverCrore * 1_00_00_000 : null;
  const declaredVsActualPct =
    declaredAnnual && declaredAnnual > 0 ? Math.round((fyTurnover / declaredAnnual) * 100) : null;

  return (
    <div className="space-y-6">
      {/* ── HEADER ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-brand-900 p-6 text-white shadow-lg">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href="/clients" className="text-xs text-white/70 hover:text-white">← All Clients</Link>
            <h1 className="mt-1 text-3xl font-bold leading-tight">{client.legalName}</h1>
            {client.tradeName ? <p className="text-white/70">{client.tradeName}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Tag>{client.gstin}</Tag>
              <Tag>PAN {client.pan}</Tag>
              <Tag>{client.state}</Tag>
              <Tag>{client.registrationType}</Tag>
              <Tag>{client.filingFrequency}</Tag>
              {client.sector ? <Tag>{client.sector}</Tag> : null}
              {!client.isActive ? <Tag tone="red">Inactive</Tag> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/invoices/new?client=${client.id}`}
              className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-white/25"
            >
              + New Invoice
            </Link>
            {can(user.role, "write") ? (
              <Link
                href={`/clients/${client.id}/edit`}
                className="inline-flex items-center rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-white/25"
              >
                Edit
              </Link>
            ) : null}
            {can(user.role, "delete") ? (
              <form action={deleteClientAction}>
                <input type="hidden" name="id" value={client.id} />
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-100 ring-1 ring-red-300/40 backdrop-blur-sm transition hover:bg-red-500/30"
                >
                  Delete
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── HEADLINE METRICS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          tone="indigo"
          label={`Turnover ${fyLabel()}`}
          value={`₹ ${inr(fyTurnover)}`}
          sub={`${fyInvoices.length} invoice${fyInvoices.length === 1 ? "" : "s"}`}
        />
        <Stat
          tone="green"
          label="Output Tax (FY)"
          value={`₹ ${inr(fyOutputTax)}`}
          sub={`Taxable ₹ ${inr(fyTaxableValue)}`}
        />
        <Stat
          tone={overUtilised ? "red" : "blue"}
          label="ITC Balance"
          value={`₹ ${inr(itcBalance)}`}
          sub={`${itcUtilPct}% utilised of ₹ ${inr(itcAvail)}`}
        />
        <Stat
          tone={compliancePct >= 90 ? "green" : compliancePct >= 70 ? "amber" : "red"}
          label="Compliance"
          value={`${compliancePct}%`}
          sub={`${filedCount}/${totalReturns} returns filed`}
        />
      </div>

      {/* ── MONTHLY TURNOVER CHART ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-900">Monthly Turnover</h2>
            <p className="text-xs text-slate-500">Last 12 months from invoices issued</p>
          </div>
          {declaredAnnual ? (
            <div className="text-right text-xs">
              <div className="text-slate-500">Declared annual</div>
              <div className="font-semibold text-slate-900">
                ₹ {inr(declaredAnnual)}{" "}
                {declaredVsActualPct !== null ? (
                  <span
                    className={
                      declaredVsActualPct > 110
                        ? "text-red-700"
                        : declaredVsActualPct < 50
                          ? "text-amber-700"
                          : "text-green-700"
                    }
                  >
                    ({declaredVsActualPct}% YTD)
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        {lifetimeInvoiceCount === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            No invoices issued yet for this client.{" "}
            <Link
              href={`/invoices/new?client=${client.id}`}
              className="text-brand-600 hover:underline"
            >
              Create the first one →
            </Link>
          </div>
        ) : (
          <div className="space-y-1.5">
            {monthlyBuckets.map((b) => {
              const widthPct = (b.total / maxMonthly) * 100;
              return (
                <div key={b.key} className="grid grid-cols-[64px_1fr_120px] items-center gap-3 text-xs">
                  <span className="text-slate-500">{b.label}</span>
                  <div className="relative h-6 rounded bg-slate-100">
                    {b.total > 0 ? (
                      <div
                        className="absolute inset-y-0 left-0 rounded bg-gradient-to-r from-brand-500 to-indigo-500"
                        style={{ width: `${Math.max(2, widthPct)}%` }}
                      />
                    ) : null}
                  </div>
                  <span className="text-right font-mono text-slate-700">
                    {b.total > 0 ? `₹ ${inr(b.total)}` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── ITC PANEL ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-900">Input Tax Credit</h2>
            <p className="text-xs text-slate-500">Lifetime ITC across {itcRecords.length} period{itcRecords.length === 1 ? "" : "s"}</p>
          </div>
          {can(user.role, "write") ? (
            <Link href={`/itc?client=${client.id}`} className="text-xs text-brand-600 hover:underline">
              Manage ITC →
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <ItcMini label="Available" value={itcAvail} tone="blue" breakdown={{
            igst: itcAgg._sum.igstAvailable ?? 0,
            cgst: itcAgg._sum.cgstAvailable ?? 0,
            sgst: itcAgg._sum.sgstAvailable ?? 0,
          }} />
          <ItcMini label="Utilised" value={itcUtil} tone="amber" breakdown={{
            igst: itcAgg._sum.igstUtilised ?? 0,
            cgst: itcAgg._sum.cgstUtilised ?? 0,
            sgst: itcAgg._sum.sgstUtilised ?? 0,
          }} />
          <ItcMini label="Balance (carry forward)" value={itcBalance} tone={overUtilised ? "red" : "green"} />
        </div>

        {/* Mismatch / flags */}
        {itcRecords.length > 0 ? (
          <div className="space-y-2">
            {overUtilised ? (
              <Flag tone="red">
                <strong>Over-utilisation:</strong> Total utilised ₹ {inr(itcUtil)} exceeds available ₹{" "}
                {inr(itcAvail)} by ₹ {inr(itcUtil - itcAvail)}. Review claims immediately.
              </Flag>
            ) : null}
            {blockedPeriods.length > 0 ? (
              <Flag tone="amber">
                <strong>{blockedPeriods.length} period{blockedPeriods.length === 1 ? "" : "s"} flagged:</strong>{" "}
                {blockedPeriods
                  .map(
                    (p) =>
                      `${formatPeriodLabel(p.period)} (${p.eligibility.toLowerCase().replace("_", " ")}${p.blockedReason ? `, ${p.blockedReason}` : ""})`
                  )
                  .join("; ")}
              </Flag>
            ) : null}
            {!overUtilised && blockedPeriods.length === 0 ? (
              <Flag tone="green">All ITC periods fully eligible — no mismatches detected.</Flag>
            ) : null}
            <p className="text-xs text-slate-500 pt-1">
              Net tax estimate (Output − ITC utilised) for {fyLabel()}: ₹ {inr(itcDeclaredVsOutput)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No ITC records yet for this client.</p>
        )}

        {itcRecords.length > 0 ? (
          <div className="overflow-x-auto mt-4">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="text-right">Available</th>
                  <th className="text-right">Utilised</th>
                  <th className="text-right">Balance</th>
                  <th>Eligibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itcRecords.map((r) => {
                  const av = r.igstAvailable + r.cgstAvailable + r.sgstAvailable;
                  const ut = r.igstUtilised + r.cgstUtilised + r.sgstUtilised;
                  const mismatched = ut > av + 0.5;
                  return (
                    <tr key={r.id} className={mismatched ? "bg-red-50" : ""}>
                      <td>{formatPeriodLabel(r.period)}</td>
                      <td className="text-right font-mono">₹ {inr(av)}</td>
                      <td className="text-right font-mono">₹ {inr(ut)}</td>
                      <td className="text-right font-mono font-semibold">₹ {inr(av - ut)}</td>
                      <td>
                        {r.eligibility === "FULLY_ELIGIBLE" && <span className="badge-green">Fully Eligible</span>}
                        {r.eligibility === "PARTIALLY_BLOCKED" && <span className="badge-amber">Partially Blocked</span>}
                        {r.eligibility === "BLOCKED" && <span className="badge-red">Blocked</span>}
                        {mismatched && <span className="badge-red ml-1">Over-utilised</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* ── MONTH-WISE GST LIABILITY SUMMARY ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Month-wise GST Liability</h2>
            <p className="text-xs text-slate-500">
              Output tax (from invoices) − ITC available (from 2B) → utilised + cash payable per Rule 88A
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Total cash payable (last 12 months)</div>
            <div className="text-lg font-bold text-red-700 font-mono">
              ₹ {totalCashPayable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
        {liabilityRows.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No invoices or ITC records yet. Once you start filing returns, this table will summarise output / ITC / cash payable per month.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="text-right">Output Tax</th>
                  <th className="text-right">ITC Available</th>
                  <th className="text-right">ITC Utilised</th>
                  <th className="text-right">Cash Payable</th>
                  <th className="text-right">Balance C/F</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {liabilityRows.map((r) => (
                  <tr key={r.period} className={r.cashPayable > 0 ? "bg-red-50/40" : ""}>
                    <td className="font-medium">{r.label}</td>
                    <td className="text-right font-mono">{inr(r.outputTotal)}</td>
                    <td className="text-right font-mono">{inr(r.availableTotal)}</td>
                    <td className="text-right font-mono text-indigo-700">{inr(r.utilisedTotal)}</td>
                    <td
                      className={`text-right font-mono font-semibold ${
                        r.cashPayable > 0 ? "text-red-700" : "text-slate-400"
                      }`}
                    >
                      {r.cashPayable > 0 ? inr(r.cashPayable) : "—"}
                    </td>
                    <td className="text-right font-mono text-green-700">{inr(r.balanceTotal)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 font-semibold">
                  <td>Total</td>
                  <td className="text-right font-mono">
                    {inr(liabilityRows.reduce((s, r) => s + r.outputTotal, 0))}
                  </td>
                  <td className="text-right font-mono">
                    {inr(liabilityRows.reduce((s, r) => s + r.availableTotal, 0))}
                  </td>
                  <td className="text-right font-mono text-indigo-700">
                    {inr(liabilityRows.reduce((s, r) => s + r.utilisedTotal, 0))}
                  </td>
                  <td className="text-right font-mono text-red-700">{inr(totalCashPayable)}</td>
                  <td className="text-right font-mono text-green-700">
                    {inr(liabilityRows.reduce((s, r) => s + r.balanceTotal, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── RETURNS + RECENT INVOICES ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Returns</h2>
            <div className="flex gap-2 text-xs">
              <span className="badge-green">{filedCount} Filed</span>
              <span className="badge-amber">{pendingCount} Pending</span>
              {overdueCount > 0 ? <span className="badge-red">{overdueCount} Overdue</span> : null}
            </div>
          </div>
          {recentReturns.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No returns recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Period</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>ARN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentReturns.map((r) => (
                    <tr key={r.id}>
                      <td>{r.type}</td>
                      <td>{formatPeriodLabel(r.period)}</td>
                      <td>{format(r.dueDate, "dd MMM yyyy")}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="font-mono text-xs">{r.arn ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-5 py-2 text-right">
            <Link href={`/returns?client=${client.id}`} className="text-xs text-brand-600 hover:underline">
              View all returns →
            </Link>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Recent Invoices</h2>
            <span className="text-xs text-slate-500">
              Lifetime: ₹ {inr(lifetimeTurnover)} · {lifetimeInvoiceCount} invoice{lifetimeInvoiceCount === 1 ? "" : "s"}
            </span>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No invoices yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Buyer</th>
                    <th>Type</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentInvoices.map((i) => (
                    <tr key={i.id}>
                      <td className="font-mono text-xs">
                        <Link href={`/invoices/${i.id}`} className="text-brand-700 hover:underline">
                          {i.invoiceNumber}
                        </Link>
                      </td>
                      <td>{format(i.invoiceDate, "dd MMM yy")}</td>
                      <td className="truncate max-w-[160px]">{i.buyerName}</td>
                      <td>
                        {i.supplyType === "INTRA_STATE" ? (
                          <span className="badge-blue">Intra</span>
                        ) : (
                          <span className="badge-amber">Inter</span>
                        )}
                      </td>
                      <td className="text-right font-semibold">₹ {inr(i.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-5 py-2 text-right">
            <Link href={`/invoices?q=${encodeURIComponent(client.legalName)}`} className="text-xs text-brand-600 hover:underline">
              View all invoices →
            </Link>
          </div>
        </div>
      </div>

      {/* ── PORTAL CREDENTIALS ── */}
      {can(user.role, "viewCredentials") ? (
        <PortalCredentials
          username={client.gstPortalUsername}
          password={decryptSecret(client.gstPortalPasswordEnc)}
          canEdit={can(user.role, "editCredentials")}
          editHref={`/clients/${client.id}/edit`}
        />
      ) : null}

      {/* ── CONTACT + ADDRESS + NOTES ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Contact</h2>
          <dl className="text-sm space-y-2">
            <DT label="Person" value={client.contactName} />
            <DT label="Email" value={client.contactEmail} link={client.contactEmail ? `mailto:${client.contactEmail}` : undefined} />
            <DT label="Phone" value={client.contactPhone} link={client.contactPhone ? `tel:${client.contactPhone}` : undefined} />
            <DT label="Sector" value={client.sector} />
            <DT
              label="Declared turnover"
              value={client.turnoverCrore ? `₹ ${client.turnoverCrore} Cr` : null}
            />
          </dl>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Registered Address</h2>
          <p className="text-sm text-slate-700 whitespace-pre-line">
            {[
              client.addressLine1,
              client.addressLine2,
              [client.city, client.pincode].filter(Boolean).join(" "),
              client.state,
            ]
              .filter(Boolean)
              .join("\n") || "—"}
          </p>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Profile</h2>
          <dl className="text-sm space-y-2">
            <DT label="Onboarded" value={format(client.createdAt, "dd MMM yyyy")} />
            <DT label="Last updated" value={format(client.updatedAt, "dd MMM yyyy")} />
            <DT label="Status" value={client.isActive ? "Active" : "Inactive"} />
          </dl>
          {client.notes ? (
            <>
              <h3 className="font-semibold text-slate-900 mt-4 mb-1 text-sm">Notes</h3>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{client.notes}</p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── helper components ─────────────────────────────────────────
function Tag({ children, tone }: { children: React.ReactNode; tone?: "red" }) {
  const cls =
    tone === "red"
      ? "bg-red-500/20 text-red-100 ring-red-300/30"
      : "bg-white/15 text-white ring-white/25";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 backdrop-blur-sm ${cls}`}>
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "blue" | "amber" | "green" | "indigo" | "red";
}) {
  const bar: Record<string, string> = {
    blue: "from-blue-500 to-blue-600",
    amber: "from-amber-500 to-amber-600",
    green: "from-green-500 to-green-600",
    indigo: "from-indigo-500 to-indigo-600",
    red: "from-red-500 to-red-600",
  };
  return (
    <div className="card p-5 relative overflow-hidden">
      <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${bar[tone]}`} />
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function ItcMini({
  label,
  value,
  tone,
  breakdown,
}: {
  label: string;
  value: number;
  tone: "blue" | "amber" | "green" | "red";
  breakdown?: { igst: number; cgst: number; sgst: number };
}) {
  const cls: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50",
    amber: "border-amber-200 bg-amber-50",
    green: "border-green-200 bg-green-50",
    red: "border-red-200 bg-red-50",
  };
  return (
    <div className={`rounded-lg border ${cls[tone]} p-3`}>
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">
        ₹ {value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
      </p>
      {breakdown ? (
        <p className="mt-1 text-xs text-slate-500">
          IGST {breakdown.igst.toLocaleString("en-IN")} · CGST {breakdown.cgst.toLocaleString("en-IN")} · SGST {breakdown.sgst.toLocaleString("en-IN")}
        </p>
      ) : null}
    </div>
  );
}

function Flag({ tone, children }: { tone: "red" | "amber" | "green"; children: React.ReactNode }) {
  const cls =
    tone === "red"
      ? "bg-red-50 text-red-800 ring-red-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : "bg-green-50 text-green-800 ring-green-200";
  return <div className={`rounded-md px-3 py-2 text-sm ring-1 ${cls}`}>{children}</div>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "FILED") return <span className="badge-green">Filed</span>;
  if (status === "OVERDUE") return <span className="badge-red">Overdue</span>;
  return <span className="badge-amber">Pending</span>;
}

function DT({ label, value, link }: { label: string; value?: string | null; link?: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2">
        {value ? (
          link ? (
            <a href={link} className="text-brand-700 hover:underline">{value}</a>
          ) : (
            value
          )
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </dd>
    </div>
  );
}
