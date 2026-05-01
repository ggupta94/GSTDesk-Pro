import { requireUser } from "@/lib/auth";
import { validateGstin } from "@/lib/gstin";

export default async function GstnLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ gstin?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const input = (sp.gstin ?? "").toUpperCase();
  const result = input ? validateGstin(input) : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">GSTN Portal Lookup</h1>
        <p className="text-sm text-slate-600">Verify live taxpayer status via GSTN public APIs (stubbed).</p>
      </div>

      <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-800">
        <strong>Stub mode:</strong> Live lookup requires a GSP API key (ClearTax / Masters India / etc.).
        For now, this page validates GSTIN locally — entity/state are decoded from the GSTIN itself.
        Wire <code>src/app/api/gstn-lookup/route.ts</code> to your GSP when ready.
      </div>

      <form className="card p-5 flex gap-3" action="/gstn-lookup">
        <input
          name="gstin"
          defaultValue={input}
          placeholder="Enter 15-digit GSTIN"
          maxLength={15}
          className="input flex-1 font-mono"
        />
        <button className="btn-primary" type="submit">Lookup</button>
      </form>

      {result ? (
        result.ok ? (
          <div className="card p-5 space-y-2">
            <h2 className="font-semibold text-slate-900">Decoded</h2>
            <dl className="grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-slate-500">GSTIN</dt><dd className="col-span-2 font-mono">{input}</dd>
              <dt className="text-slate-500">Status</dt><dd className="col-span-2"><span className="badge-green">Format Valid</span></dd>
              <dt className="text-slate-500">State</dt><dd className="col-span-2">{result.state} ({result.stateCode})</dd>
              <dt className="text-slate-500">PAN</dt><dd className="col-span-2 font-mono">{result.pan}</dd>
              <dt className="text-slate-500">Entity Code</dt><dd className="col-span-2 font-mono">{result.entityCode}</dd>
            </dl>
            <p className="text-xs text-slate-500">Live registration status, legal name, business activity, etc. would come from the GSP API.</p>
          </div>
        ) : (
          <div className="card p-5">
            <span className="badge-red">Invalid</span>
            <p className="mt-2 text-sm">{result.error}</p>
          </div>
        )
      ) : null}
    </div>
  );
}
