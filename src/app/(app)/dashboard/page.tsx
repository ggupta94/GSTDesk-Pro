import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { differenceInDays, format, startOfMonth, subMonths } from "date-fns";
import { formatPeriodLabel } from "@/lib/gst";
import { markFiledAction } from "../returns/actions";

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const lastMonthStart = startOfMonth(subMonths(now, 1));

  const [
    clientCount,
    pendingCount,
    filedCount,
    overdueCount,
    filedThisMonth,
    filedLastMonth,
    itcAgg,
    overdueReturns,
    upcomingReturns,
    recentFilings,
  ] = await Promise.all([
    prisma.client.count({ where: { isActive: true } }),
    prisma.return.count({ where: { status: "PENDING" } }),
    prisma.return.count({ where: { status: "FILED" } }),
    prisma.return.count({ where: { status: "PENDING", dueDate: { lt: now } } }),
    prisma.return.count({ where: { status: "FILED", filedAt: { gte: monthStart, lte: monthEnd } } }),
    prisma.return.count({
      where: { status: "FILED", filedAt: { gte: lastMonthStart, lt: monthStart } },
    }),
    prisma.iTCRecord.aggregate({
      _sum: {
        igstAvailable: true,
        cgstAvailable: true,
        sgstAvailable: true,
        igstUtilised: true,
        cgstUtilised: true,
        sgstUtilised: true,
      },
    }),
    prisma.return.findMany({
      where: { status: "PENDING", dueDate: { lt: now } },
      include: { client: true },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    prisma.return.findMany({
      where: { status: "PENDING", dueDate: { gte: now, lte: monthEnd } },
      include: { client: true },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    prisma.return.findMany({
      where: { status: "FILED" },
      include: { client: true, filedBy: true },
      orderBy: { filedAt: "desc" },
      take: 8,
    }),
  ]);

  const totalItcAvail =
    (itcAgg._sum.igstAvailable ?? 0) +
    (itcAgg._sum.cgstAvailable ?? 0) +
    (itcAgg._sum.sgstAvailable ?? 0);
  const totalItcUtil =
    (itcAgg._sum.igstUtilised ?? 0) +
    (itcAgg._sum.cgstUtilised ?? 0) +
    (itcAgg._sum.sgstUtilised ?? 0);
  const itcUtilPct =
    totalItcAvail > 0 ? Math.min(100, Math.round((totalItcUtil / totalItcAvail) * 100)) : 0;
  const itcBalance = totalItcAvail - totalItcUtil;

  const totalReturns = pendingCount + filedCount;
  const compliancePct =
    totalReturns > 0 ? Math.round(((filedCount) / totalReturns) * 100) : 100;

  const monthDelta = filedThisMonth - filedLastMonth;

  const greeting = greet(now);

  return (
    <div className="space-y-6">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-700 p-6 text-white shadow-lg">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -left-10 -bottom-16 h-48 w-48 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/80">{greeting}</p>
            <h1 className="mt-1 text-3xl font-bold leading-tight">{user.fullName}</h1>
            <p className="mt-1 text-sm text-white/80">{format(now, "EEEE, dd MMMM yyyy")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickAction href="/clients/new" icon="user-plus" label="Add Client" />
            <QuickAction href="/invoices/new" icon="invoice" label="New Invoice" />
            <QuickAction href="/returns" icon="clipboard" label="Track Return" />
            <QuickAction href="/calculator" icon="calculator" label="Calculator" />
          </div>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric
          title="Active Clients"
          value={clientCount.toLocaleString("en-IN")}
          sub="under management"
          icon="users"
          tone="blue"
          href="/clients"
        />
        <Metric
          title="Pending Returns"
          value={pendingCount.toLocaleString("en-IN")}
          sub={overdueCount > 0 ? `${overdueCount} overdue` : "on track"}
          icon="clock"
          tone={overdueCount > 0 ? "red" : "amber"}
          href="/returns?status=PENDING"
        />
        <Metric
          title="Filed This Month"
          value={filedThisMonth.toLocaleString("en-IN")}
          sub={
            monthDelta === 0
              ? "same as last month"
              : monthDelta > 0
                ? `+${monthDelta} vs last month`
                : `${monthDelta} vs last month`
          }
          subTone={monthDelta >= 0 ? "up" : "down"}
          icon="check"
          tone="green"
          href="/returns?status=FILED"
        />
        <Metric
          title="ITC Pool Balance"
          value={`₹ ${formatINR(itcBalance)}`}
          sub={`${itcUtilPct}% utilised of ₹ ${formatINR(totalItcAvail)}`}
          icon="bank"
          tone="indigo"
          href="/itc"
        />
      </div>

      {/* COMPLIANCE + ITC ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Compliance Score
          </h2>
          <div className="mt-3 flex items-center gap-5">
            <Ring percent={compliancePct} />
            <div>
              <div className="text-3xl font-bold text-slate-900">{compliancePct}%</div>
              <p className="text-xs text-slate-500">
                {filedCount.toLocaleString("en-IN")} of{" "}
                {totalReturns.toLocaleString("en-IN")} returns filed
              </p>
              <p className="mt-2 text-xs">
                {compliancePct >= 90 ? (
                  <span className="text-green-700">Excellent — keep it up.</span>
                ) : compliancePct >= 70 ? (
                  <span className="text-amber-700">Decent. Tackle the overdue list.</span>
                ) : (
                  <span className="text-red-700">Action needed — high backlog.</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            Filing Status Breakdown
          </h2>
          <div className="mt-4 space-y-3">
            <StackedBar
              filed={filedCount}
              pending={pendingCount - overdueCount}
              overdue={overdueCount}
            />
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Legend dot="bg-green-500" label="Filed" value={filedCount} />
              <Legend dot="bg-amber-500" label="Pending" value={pendingCount - overdueCount} />
              <Legend dot="bg-red-500" label="Overdue" value={overdueCount} />
            </div>
          </div>
        </div>
      </div>

      {/* OVERDUE + UPCOMING */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="Overdue Returns"
          accent="red"
          right={overdueCount > 0 ? <span className="badge-red">{overdueCount}</span> : null}
        >
          {overdueReturns.length === 0 ? (
            <Empty icon="check" message="Nothing overdue. Great work." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {overdueReturns.map((r) => {
                const days = differenceInDays(now, r.dueDate);
                return (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                      <Icon name="alert" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clients/${r.clientId}`}
                        className="block font-medium text-slate-900 hover:text-brand-700 truncate"
                      >
                        {r.client.legalName}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {r.type} · {formatPeriodLabel(r.period)} · due{" "}
                        {format(r.dueDate, "dd MMM")} ·{" "}
                        <span className="text-red-700 font-medium">
                          {days} day{days === 1 ? "" : "s"} late
                        </span>
                      </p>
                    </div>
                    <form action={markFiledAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn-secondary text-xs py-1 px-2" type="submit">
                        Mark Filed
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Upcoming This Month"
          accent="green"
          right={
            <Link
              href="/returns?status=PENDING"
              className="text-xs text-brand-600 hover:underline"
            >
              View all →
            </Link>
          }
        >
          {upcomingReturns.length === 0 ? (
            <Empty icon="calendar" message="Nothing due in the next 30 days." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcomingReturns.map((r) => {
                const daysLeft = differenceInDays(r.dueDate, now);
                const tone =
                  daysLeft <= 3
                    ? "text-red-700"
                    : daysLeft <= 7
                      ? "text-amber-700"
                      : "text-slate-600";
                return (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <Icon name="calendar" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clients/${r.clientId}`}
                        className="block font-medium text-slate-900 hover:text-brand-700 truncate"
                      >
                        {r.client.legalName}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {r.type} · {formatPeriodLabel(r.period)} · due{" "}
                        {format(r.dueDate, "dd MMM")} ·{" "}
                        <span className={tone + " font-medium"}>
                          {daysLeft === 0
                            ? "today"
                            : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* RECENT FILINGS */}
      <Panel
        title="Recent Filings"
        right={
          <Link href="/returns?status=FILED" className="text-xs text-brand-600 hover:underline">
            View all →
          </Link>
        }
      >
        {recentFilings.length === 0 ? (
          <Empty icon="clipboard" message="No filings recorded yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Filed</th>
                  <th>ARN</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentFilings.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">
                      <Link
                        href={`/clients/${r.clientId}`}
                        className="text-brand-700 hover:underline"
                      >
                        {r.client.legalName}
                      </Link>
                    </td>
                    <td>{r.type}</td>
                    <td>{formatPeriodLabel(r.period)}</td>
                    <td>{r.filedAt ? format(r.filedAt, "dd MMM yyyy") : "—"}</td>
                    <td className="font-mono text-xs">{r.arn ?? "—"}</td>
                    <td className="text-slate-600">{r.filedBy?.fullName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ─── HELPERS ───────────────────────────────────────────────────
function greet(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Good morning,";
  if (h < 17) return "Good afternoon,";
  return "Good evening,";
}

function formatINR(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ─── COMPONENTS ────────────────────────────────────────────────
function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: IconName;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm ring-1 ring-white/25 transition hover:bg-white/25"
    >
      <Icon name={icon} />
      {label}
    </Link>
  );
}

function Metric({
  title,
  value,
  sub,
  subTone,
  icon,
  tone,
  href,
}: {
  title: string;
  value: string;
  sub: string;
  subTone?: "up" | "down";
  icon: IconName;
  tone: "blue" | "amber" | "green" | "indigo" | "red";
  href: string;
}) {
  const toneStyles: Record<string, { bar: string; iconBg: string; iconFg: string }> = {
    blue: { bar: "from-blue-500 to-blue-600", iconBg: "bg-blue-100", iconFg: "text-blue-600" },
    amber: { bar: "from-amber-500 to-amber-600", iconBg: "bg-amber-100", iconFg: "text-amber-600" },
    green: { bar: "from-green-500 to-green-600", iconBg: "bg-green-100", iconFg: "text-green-600" },
    indigo: {
      bar: "from-indigo-500 to-indigo-600",
      iconBg: "bg-indigo-100",
      iconFg: "text-indigo-600",
    },
    red: { bar: "from-red-500 to-red-600", iconBg: "bg-red-100", iconFg: "text-red-600" },
  };
  const t = toneStyles[tone];
  return (
    <Link
      href={href}
      className="card p-5 block hover:shadow-md transition-shadow group relative overflow-hidden"
    >
      <span
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.bar}`}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 group-hover:text-brand-700 transition-colors">
            {value}
          </p>
          <p
            className={`mt-1 text-xs ${
              subTone === "up"
                ? "text-green-700"
                : subTone === "down"
                  ? "text-red-700"
                  : "text-slate-500"
            }`}
          >
            {subTone === "up" ? "▲ " : subTone === "down" ? "▼ " : ""}
            {sub}
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${t.iconBg} ${t.iconFg}`}>
          <Icon name={icon} />
        </div>
      </div>
    </Link>
  );
}

function Ring({ percent }: { percent: number }) {
  // SVG ring chart
  const r = 32;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  const colour = percent >= 90 ? "#16a34a" : percent >= 70 ? "#d97706" : "#dc2626";
  return (
    <svg width={80} height={80} viewBox="0 0 80 80" className="shrink-0">
      <circle cx={40} cy={40} r={r} stroke="#e2e8f0" strokeWidth={8} fill="none" />
      <circle
        cx={40}
        cy={40}
        r={r}
        stroke={colour}
        strokeWidth={8}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 40 40)"
      />
    </svg>
  );
}

function StackedBar({
  filed,
  pending,
  overdue,
}: {
  filed: number;
  pending: number;
  overdue: number;
}) {
  const total = Math.max(1, filed + pending + overdue);
  const fp = (filed / total) * 100;
  const pp = (pending / total) * 100;
  const op = (overdue / total) * 100;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="flex h-full">
        {fp > 0 ? <div className="h-full bg-green-500" style={{ width: `${fp}%` }} /> : null}
        {pp > 0 ? <div className="h-full bg-amber-500" style={{ width: `${pp}%` }} /> : null}
        {op > 0 ? <div className="h-full bg-red-500" style={{ width: `${op}%` }} /> : null}
      </div>
    </div>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span className="text-slate-600">{label}</span>
      <span className="ml-auto font-semibold text-slate-900">
        {value.toLocaleString("en-IN")}
      </span>
    </div>
  );
}

function Panel({
  title,
  right,
  accent,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  accent?: "red" | "green";
  children: React.ReactNode;
}) {
  const stripe =
    accent === "red"
      ? "before:bg-red-500"
      : accent === "green"
        ? "before:bg-green-500"
        : "before:bg-slate-200";
  return (
    <div
      className={`card overflow-hidden relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${stripe}`}
    >
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Empty({ icon, message }: { icon: IconName; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon name={icon} />
      </div>
      <p className="mt-3 text-sm text-slate-500">{message}</p>
    </div>
  );
}

// ─── ICONS (inline SVG, no extra deps) ─────────────────────────
type IconName =
  | "users"
  | "user-plus"
  | "clock"
  | "check"
  | "bank"
  | "alert"
  | "calendar"
  | "clipboard"
  | "invoice"
  | "calculator";

function Icon({ name }: { name: IconName }) {
  const props = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "users":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "user-plus":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      );
    case "clock":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "bank":
      return (
        <svg {...props}>
          <path d="M3 21h18" />
          <path d="M3 10h18" />
          <path d="M5 6l7-3 7 3" />
          <path d="M4 10v11" />
          <path d="M20 10v11" />
          <path d="M8 14v3" />
          <path d="M12 14v3" />
          <path d="M16 14v3" />
        </svg>
      );
    case "alert":
      return (
        <svg {...props}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...props}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        </svg>
      );
    case "invoice":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
    case "calculator":
      return (
        <svg {...props}>
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <line x1="8" y1="12" x2="8" y2="12" />
          <line x1="12" y1="12" x2="12" y2="12" />
          <line x1="16" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="8" y2="16" />
          <line x1="12" y1="16" x2="12" y2="16" />
          <line x1="16" y1="16" x2="16" y2="16" />
        </svg>
      );
  }
}
