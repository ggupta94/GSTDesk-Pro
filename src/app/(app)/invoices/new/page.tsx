import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/constants";
import InvoiceForm from "../InvoiceForm";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "write")) redirect("/invoices");
  const sp = await searchParams;

  const clients = await prisma.client.findMany({
    where: { isActive: true },
    orderBy: { legalName: "asc" },
    select: { id: true, legalName: true, gstin: true, stateCode: true, state: true },
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Invoice</h1>
          <p className="text-sm text-slate-600">GST-compliant tax invoice. Tax type auto-detects from supplier vs buyer state.</p>
        </div>
        <Link href="/invoices" className="btn-secondary">Cancel</Link>
      </div>
      {sp.error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{sp.error}</div>
      ) : null}
      <InvoiceForm clients={clients} />
    </div>
  );
}
