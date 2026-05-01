import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can, REGISTRATION_TYPES } from "@/lib/constants";
import { redirect } from "next/navigation";
import ClientForm from "../ClientForm";

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "write")) redirect("/clients");
  const params = await searchParams;
  void REGISTRATION_TYPES;
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add Client</h1>
          <p className="text-sm text-slate-600">Enter GSTIN — state and PAN will be auto-derived.</p>
        </div>
        <Link href="/clients" className="btn-secondary">Cancel</Link>
      </div>
      {params.error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{params.error}</div>
      ) : null}
      <ClientForm mode="create" />
    </div>
  );
}
