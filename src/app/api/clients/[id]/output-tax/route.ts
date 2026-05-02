import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Returns the GST output tax (sum of CGST/SGST/IGST collected on invoices)
// for a client + period. Used by the ITC form to auto-calculate utilisation.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const period = req.nextUrl.searchParams.get("period") ?? "";
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });
  }
  const [yyyy, mm] = period.split("-").map((s) => parseInt(s, 10));
  const start = new Date(yyyy, mm - 1, 1);
  const end = new Date(yyyy, mm, 0, 23, 59, 59);

  const agg = await prisma.invoice.aggregate({
    where: { clientId: id, invoiceDate: { gte: start, lte: end } },
    _sum: { totalCgst: true, totalSgst: true, totalIgst: true, subTotal: true, grandTotal: true },
    _count: { _all: true },
  });

  return NextResponse.json({
    ok: true,
    period,
    invoiceCount: agg._count._all,
    taxableValue: agg._sum.subTotal ?? 0,
    grandTotal: agg._sum.grandTotal ?? 0,
    igst: agg._sum.totalIgst ?? 0,
    cgst: agg._sum.totalCgst ?? 0,
    sgst: agg._sum.totalSgst ?? 0,
  });
}
