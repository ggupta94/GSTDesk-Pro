import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/constants";
import { formatPeriodLabel } from "@/lib/gst";
import { deleteClientAction } from "../actions";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      returns: { orderBy: { dueDate: "desc" }, take: 12 },
      itc: { orderBy: { period: "desc" }, take: 6 },
      invoices: { orderBy: { invoiceDate: "desc" }, take: 6 },
    },
  });
  if (!client) notFound();

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{client.legalName}</h1>
          {client.tradeName ? <p className="text-sm text-slate-600">{client.tradeName}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="badge-blue font-mono">{client.gstin}</span>
            <span className="badge-gray">PAN: {client.pan}</span>
            <span className="badge-gray">{client.state}</span>
            <span className="badge-gray">{client.registrationType}</span>
            <span className="badge-gray">{client.filingFrequency}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {can(user.role, "write") ? (
            <Link href={`/clients/${client.id}/edit`} className="btn-secondary">Edit</Link>
          ) : null}
          {can(user.role, "delete") ? (
            <form action={deleteClientAction}>
              <input type="hidden" name="id" value={client.id} />
              <button className="btn-danger" type="submit">Delete</button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Contact</h2>
          <dl className="text-sm grid grid-cols-3 gap-y-2">
            <dt className="text-slate-500">Person</dt><dd className="col-span-2">{client.contactName ?? "—"}</dd>
            <dt className="text-slate-500">Email</dt><dd className="col-span-2">{client.contactEmail ?? "—"}</dd>
            <dt className="text-slate-500">Phone</dt><dd className="col-span-2">{client.contactPhone ?? "—"}</dd>
            <dt className="text-slate-500">Sector</dt><dd className="col-span-2">{client.sector ?? "—"}</dd>
            <dt className="text-slate-500">Turnover</dt><dd className="col-span-2">{client.turnoverCrore ? `₹ ${client.turnoverCrore} Cr` : "—"}</dd>
          </dl>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Address</h2>
          <p className="text-sm text-slate-700">
            {[client.addressLine1, client.addressLine2, client.city, client.pincode].filter(Boolean).join(", ") || "—"}
          </p>
          {client.notes ? (
            <>
              <h3 className="font-semibold text-slate-900 mt-4 mb-1 text-sm">Notes</h3>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{client.notes}</p>
            </>
          ) : null}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Recent Returns</h2>
          <Link href={`/returns?client=${client.id}`} className="text-sm text-brand-600 hover:underline">View all</Link>
        </div>
        {client.returns.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No returns recorded.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr><th>Type</th><th>Period</th><th>Due</th><th>Filed</th><th>ARN</th><th>Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {client.returns.map((r) => (
                <tr key={r.id}>
                  <td>{r.type}</td>
                  <td>{formatPeriodLabel(r.period)}</td>
                  <td>{format(r.dueDate, "dd MMM yyyy")}</td>
                  <td>{r.filedAt ? format(r.filedAt, "dd MMM yyyy") : "—"}</td>
                  <td className="font-mono text-xs">{r.arn ?? "—"}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "FILED") return <span className="badge-green">Filed</span>;
  if (status === "OVERDUE") return <span className="badge-red">Overdue</span>;
  return <span className="badge-amber">Pending</span>;
}
