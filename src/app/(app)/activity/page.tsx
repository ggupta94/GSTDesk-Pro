import { redirect } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export default async function ActivityPage() {
  const me = await requireUser();
  if (me.role !== "CA") redirect("/dashboard");

  const logs = await prisma.activityLog.findMany({
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900">Activity Log</h1>
      <div className="card overflow-hidden">
        <table className="table-base">
          <thead>
            <tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Meta</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-slate-500">No activity yet.</td></tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id}>
                  <td className="text-xs text-slate-600">{format(l.createdAt, "dd MMM yyyy HH:mm")}</td>
                  <td>{l.user.fullName} <span className="text-xs text-slate-500">({l.user.username})</span></td>
                  <td className="font-mono text-xs">{l.action}</td>
                  <td>{l.entity}{l.entityId ? <span className="text-xs text-slate-500"> · {l.entityId.slice(0, 8)}</span> : null}</td>
                  <td className="text-xs text-slate-600 max-w-xs truncate">{l.meta ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
