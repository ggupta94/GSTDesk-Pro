import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { validateGstin } from "@/lib/gstin";

// Stubbed live GSTN portal lookup. Replace with a call to your GSP provider
// (ClearTax / Masters India / KDK / etc.) once an API key is available.
// Reference: https://docs.cleartax.in/gst-search-api  (or the equivalent docs of your provider)

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gstin = (req.nextUrl.searchParams.get("gstin") ?? "").toUpperCase();
  const v = validateGstin(gstin);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });

  // TODO: replace with real fetch:
  //   const apiRes = await fetch(`${process.env.GSP_BASE}/gstin/${gstin}`, {
  //     headers: { Authorization: `Bearer ${process.env.GSP_API_KEY}` },
  //   });
  //   return NextResponse.json(await apiRes.json());

  return NextResponse.json({
    ok: true,
    stub: true,
    gstin,
    pan: v.pan,
    state: v.state,
    stateCode: v.stateCode,
    entityCode: v.entityCode,
    note: "Live lookup not yet wired. Connect a GSP provider in src/app/api/gstn-lookup/route.ts.",
  });
}
