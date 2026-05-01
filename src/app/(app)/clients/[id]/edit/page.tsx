import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/constants";
import ClientForm from "../../ClientForm";

export default async function EditClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "write")) redirect("/clients");
  const { id } = await params;
  const sp = await searchParams;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Edit Client</h1>
        <Link href={`/clients/${client.id}`} className="btn-secondary">Cancel</Link>
      </div>
      {sp.error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{sp.error}</div>
      ) : null}
      <ClientForm mode="edit" client={client} />
    </div>
  );
}
