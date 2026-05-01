import { redirect } from "next/navigation";
import { getCurrentUser, getSession, verifyPassword, logActivity } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/constants";

async function loginAction(formData: FormData) {
  "use server";
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    redirect("/login?error=Missing+credentials");
  }
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) {
    redirect("/login?error=Invalid+credentials");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    redirect("/login?error=Invalid+credentials");
  }
  const session = await getSession();
  session.user = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role as Role,
  };
  await session.save();
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await logActivity(user.id, "login");
  redirect("/dashboard");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const existing = await getCurrentUser();
  if (existing) redirect("/dashboard");
  const params = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-brand-600 text-white text-xl font-bold">
            G
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">GSTDesk Pro</h1>
          <p className="text-sm text-slate-600">CA office GST management</p>
        </div>
        <form action={loginAction} className="card p-6 space-y-4">
          {params.error ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
              {params.error}
            </div>
          ) : null}
          <div>
            <label className="label" htmlFor="username">Username</label>
            <input id="username" name="username" className="input" autoComplete="username" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
          </div>
          <button className="btn-primary w-full" type="submit">Sign in</button>
          <p className="text-xs text-slate-500 text-center">
            Default users (after seeding): <code>ca</code> / <code>article</code> / <code>staff</code> · password <code>password</code>
          </p>
        </form>
      </div>
    </div>
  );
}
