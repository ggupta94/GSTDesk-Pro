import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/constants";
import { deleteInvoiceAction } from "./actions";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const where: Record<string, unknown> = {};
  if (sp.q) {
    where.OR = [
      { invoiceNumber: { contains: sp.q } },
      { buyerName: { contains: sp.q } },
    ];
  }
  const invoices = await prisma.invoice.findMany({
    where,
    include: { client: true },
    orderBy: { invoiceDate: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-600">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}</p>
        </div>
        {can(user.role, "write") ? (
          <Link href="/invoices/new" className="btn-primary">+ New Invoice</Link>
        ) : null}
      </div>

      <div className="card p-4">
        <form className="flex gap-3">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search invoice # or buyer…" className="input flex-1" />
          <button className="btn-secondary" type="submit">Search</button>
          {sp.q && <Link href="/invoices" className="btn-secondary">Reset</Link>}
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Supplier (Client)</th>
                <th>Buyer</th>
                <th>Type</th>
                <th className="text-right">Amount (₹)</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-500">
                  No invoices yet. {can(user.role, "write") && <Link href="/invoices/new" className="text-brand-600 hover:underline">Create one</Link>}.
                </td></tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-mono">
                      <Link href={`/invoices/${inv.id}`} className="text-brand-700 hover:underline">{inv.invoiceNumber}</Link>
                    </td>
                    <td>{format(inv.invoiceDate, "dd MMM yyyy")}</td>
                    <td>{inv.client.legalName}</td>
                    <td>{inv.buyerName}</td>
                    <td>
                      {inv.supplyType === "INTRA_STATE"
                        ? <span className="badge-blue">Intra-State</span>
                        : <span className="badge-amber">Inter-State</span>}
                    </td>
                    <td className="text-right font-semibold">{inv.grandTotal.toLocaleString("en-IN")}</td>
                    <td className="text-right space-x-2">
                      <Link href={`/invoices/${inv.id}/print`} target="_blank" className="text-brand-600 hover:underline text-xs">Print</Link>
                      {can(user.role, "delete") ? (
                        <form action={deleteInvoiceAction} className="inline">
                          <input type="hidden" name="id" value={inv.id} />
                          <button className="text-red-600 hover:underline text-xs" type="submit">Delete</button>
                        </form>
                      ) : null}
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
