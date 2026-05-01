import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-slate-900 text-slate-200 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white font-bold">G</span>
            <span className="font-semibold text-white">GSTDesk Pro</span>
          </Link>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1 text-sm">
          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/clients" label="Clients" />
          <NavLink href="/returns" label="Return Tracker" />
          <NavLink href="/itc" label="ITC Tracker" />
          <NavLink href="/invoices" label="Invoices" />
          <NavLink href="/calculator" label="GST Calculator" />
          <NavLink href="/hsn" label="HSN / SAC Lookup" />
          <NavLink href="/gstn-lookup" label="GSTN Portal Lookup" />
          {user.role === "CA" ? (
            <>
              <div className="pt-4 pb-1 px-3 text-xs uppercase tracking-wider text-slate-500">Admin</div>
              <NavLink href="/users" label="Users" />
              <NavLink href="/activity" label="Activity Log" />
            </>
          ) : null}
        </nav>
        <div className="px-4 py-3 border-t border-slate-800 text-xs">
          <div className="font-semibold text-white">{user.fullName}</div>
          <div className="text-slate-400">{ROLE_LABELS[user.role]}</div>
          <form action="/api/auth/logout" method="POST" className="mt-2">
            <button className="text-brand-500 hover:text-brand-100" type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="px-6 py-6 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-md px-3 py-2 hover:bg-slate-800 hover:text-white transition-colors"
    >
      {label}
    </Link>
  );
}
