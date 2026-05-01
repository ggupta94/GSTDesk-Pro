import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export default async function HsnLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const type = sp.type ?? "";

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [{ code: { contains: q } }, { description: { contains: q } }];
  }
  if (type === "HSN" || type === "SAC") where.type = type;

  const results = q || type
    ? await prisma.hsnSacCode.findMany({ where, take: 100, orderBy: { code: "asc" } })
    : await prisma.hsnSacCode.findMany({ take: 50, orderBy: { code: "asc" } });

  const total = await prisma.hsnSacCode.count();

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">HSN / SAC Lookup</h1>
        <p className="text-sm text-slate-600">{total} codes in reference table.</p>
      </div>

      <div className="card p-4">
        <form className="flex flex-wrap gap-3">
          <input name="q" defaultValue={q} placeholder="Search code or description…" className="input flex-1 min-w-[240px]" />
          <select name="type" defaultValue={type} className="input w-32">
            <option value="">All</option>
            <option value="HSN">HSN</option>
            <option value="SAC">SAC</option>
          </select>
          <button className="btn-secondary" type="submit">Search</button>
        </form>
      </div>

      <div className="card overflow-hidden">
        <table className="table-base">
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Description</th>
              <th className="text-right">GST Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.length === 0 ? (
              <tr><td colSpan={4} className="py-12 text-center text-slate-500">No matches.</td></tr>
            ) : (
              results.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono">{r.code}</td>
                  <td>{r.type === "HSN" ? <span className="badge-blue">HSN</span> : <span className="badge-amber">SAC</span>}</td>
                  <td>{r.description}</td>
                  <td className="text-right font-semibold">{r.gstRate}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
