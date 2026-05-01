import { redirect } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser, hashPassword, logActivity } from "@/lib/auth";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/constants";

async function createUserAction(formData: FormData) {
  "use server";
  const me = await requireUser();
  if (me.role !== "CA") redirect("/users?error=No+permission");
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const role = String(formData.get("role") || "") as Role;

  if (!username || !password || !fullName || !role) redirect("/users?error=Missing+fields");
  if (password.length < 6) redirect("/users?error=Password+min+6+chars");
  if (!Object.values(ROLES).includes(role)) redirect("/users?error=Invalid+role");

  try {
    const passwordHash = await hashPassword(password);
    const u = await prisma.user.create({
      data: { username, passwordHash, fullName, role, isActive: true },
    });
    await logActivity(me.id, "user.create", "User", u.id, { username, role });
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message.includes("Unique") ? "Username already taken" : "Failed";
    redirect(`/users?error=${encodeURIComponent(msg)}`);
  }
  redirect("/users");
}

async function toggleActiveAction(formData: FormData) {
  "use server";
  const me = await requireUser();
  if (me.role !== "CA") redirect("/users?error=No+permission");
  const id = String(formData.get("id") || "");
  if (!id || id === me.id) redirect("/users");
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) redirect("/users");
  await prisma.user.update({ where: { id }, data: { isActive: !u.isActive } });
  await logActivity(me.id, u.isActive ? "user.deactivate" : "user.activate", "User", id);
  redirect("/users");
}

async function resetPasswordAction(formData: FormData) {
  "use server";
  const me = await requireUser();
  if (me.role !== "CA") redirect("/users?error=No+permission");
  const id = String(formData.get("id") || "");
  const newPassword = String(formData.get("password") || "");
  if (!id || newPassword.length < 6) redirect("/users?error=Password+min+6+chars");
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await logActivity(me.id, "user.resetPassword", "User", id);
  redirect("/users");
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireUser();
  if (me.role !== "CA") redirect("/dashboard");
  const sp = await searchParams;

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Users</h1>
        <p className="text-sm text-slate-600">Only CAs can manage users.</p>
      </div>

      {sp.error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{sp.error}</div>
      ) : null}

      <div className="card p-5">
        <h2 className="font-semibold text-slate-900 mb-3">Add User</h2>
        <form action={createUserAction} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div><label className="label">Username</label><input name="username" className="input" required /></div>
          <div><label className="label">Full Name</label><input name="fullName" className="input" required /></div>
          <div>
            <label className="label">Role</label>
            <select name="role" className="input" required>
              {Object.values(ROLES).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div><label className="label">Password</label><input name="password" type="password" className="input" minLength={6} required /></div>
          <button className="btn-primary" type="submit">Create</button>
        </form>
      </div>

      <div className="card overflow-hidden">
        <table className="table-base">
          <thead>
            <tr><th>Username</th><th>Name</th><th>Role</th><th>Last Login</th><th>Status</th><th className="text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-mono">{u.username}</td>
                <td>{u.fullName}</td>
                <td>{ROLE_LABELS[u.role as Role] ?? u.role}</td>
                <td>{u.lastLoginAt ? format(u.lastLoginAt, "dd MMM yyyy HH:mm") : "—"}</td>
                <td>{u.isActive ? <span className="badge-green">Active</span> : <span className="badge-gray">Disabled</span>}</td>
                <td className="text-right space-x-2">
                  {u.id !== me.id ? (
                    <form action={toggleActiveAction} className="inline">
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-xs text-slate-700 hover:underline" type="submit">{u.isActive ? "Disable" : "Enable"}</button>
                    </form>
                  ) : <span className="text-xs text-slate-400">(you)</span>}
                  <form action={resetPasswordAction} className="inline-flex items-center gap-1">
                    <input type="hidden" name="id" value={u.id} />
                    <input name="password" type="password" placeholder="New pw" className="input py-1 px-2 text-xs w-24" minLength={6} />
                    <button className="text-xs text-brand-600 hover:underline" type="submit">Reset</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
