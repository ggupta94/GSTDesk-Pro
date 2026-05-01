import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/constants";
import { decryptSecret } from "@/lib/crypto";

// Fetch ITC (GSTR-2B) for a client + period.
//
// STUB MODE (default): returns deterministic, plausible numbers based on the
// client+period seed so the UI flow can be exercised end-to-end.
//
// LIVE MODE: replace the stub block with a call to your GSP provider
// (ClearTax / Masters India / KDK / etc.). Most GSPs expose:
//   POST {base}/auth/otp        — initiate OTP using client GSTIN + portal user
//   POST {base}/auth/otp/verify — verify OTP -> auth token
//   GET  {base}/returns/gstr2b?gstin=&period=  — auto-populated ITC
//
// Direct automation against gst.gov.in does NOT work — the portal enforces
// CAPTCHA + OTP-to-mobile on every login, by design. A GSP subscription is
// the only reliable path.

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Gate on viewCredentials, not viewItc — fetching uses the client's portal
  // password, so anyone allowed to trigger a fetch must also be allowed to see it.
  if (!can(user.role, "viewCredentials"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const period = req.nextUrl.searchParams.get("period") ?? "";
  if (!period) return NextResponse.json({ error: "period query param required" }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const username = client.gstPortalUsername;
  const password = decryptSecret(client.gstPortalPasswordEnc);
  if (!username || !password) {
    return NextResponse.json(
      {
        ok: false,
        needsSetup: true,
        error:
          "GST portal credentials not saved for this client. Add them on the client edit page first.",
      },
      { status: 400 }
    );
  }

  const hasGsp = !!process.env.GSP_API_KEY && !!process.env.GSP_BASE_URL;

  if (hasGsp) {
    // ── LIVE GSP CALL ─────────────────────────────────────────
    // Example shape; adapt to your provider's actual API.
    try {
      const r = await fetch(
        `${process.env.GSP_BASE_URL}/returns/gstr2b?gstin=${client.gstin}&period=${period}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.GSP_API_KEY}`,
            "X-Client-User": username, // most GSPs proxy the client login behind the scenes
            // Most providers handle the OTP flow with a separate /auth/otp/verify call
            // and persist a short-lived bearer for subsequent calls.
          },
          cache: "no-store",
        }
      );
      if (!r.ok) throw new Error(`GSP responded ${r.status}`);
      const data = (await r.json()) as {
        igst_available?: number;
        cgst_available?: number;
        sgst_available?: number;
      };
      return NextResponse.json({
        ok: true,
        stub: false,
        period,
        gstin: client.gstin,
        source: "gsp",
        fetchedAt: new Date().toISOString(),
        igstAvailable: data.igst_available ?? 0,
        cgstAvailable: data.cgst_available ?? 0,
        sgstAvailable: data.sgst_available ?? 0,
        igstUtilised: 0,
        cgstUtilised: 0,
        sgstUtilised: 0,
        eligibility: "FULLY_ELIGIBLE",
      });
    } catch (e: unknown) {
      return NextResponse.json(
        {
          ok: false,
          error: `GSP fetch failed: ${e instanceof Error ? e.message : "unknown"}`,
        },
        { status: 502 }
      );
    }
  }

  // ── STUB MODE ───────────────────────────────────────────────
  // Deterministic plausible numbers, seeded on (client.id + period). For real
  // CA-office demos, you'll want to wire a GSP — see env vars at top of file.
  const seedStr = client.id + period;
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  const r = (mod: number) => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h % mod;
  };

  const igstAvailable = 25000 + r(75000);
  const cgstAvailable = 15000 + r(35000);
  const sgstAvailable = 15000 + r(35000);

  // Existing record (if any) — so we don't blow away saved utilisation
  const existing = await prisma.iTCRecord.findUnique({
    where: { clientId_period: { clientId: id, period } },
  });

  return NextResponse.json({
    ok: true,
    stub: true,
    period,
    gstin: client.gstin,
    source: "stub",
    fetchedAt: new Date().toISOString(),
    igstAvailable,
    cgstAvailable,
    sgstAvailable,
    igstUtilised: existing?.igstUtilised ?? 0,
    cgstUtilised: existing?.cgstUtilised ?? 0,
    sgstUtilised: existing?.sgstUtilised ?? 0,
    eligibility: existing?.eligibility ?? "FULLY_ELIGIBLE",
    blockedReason: existing?.blockedReason ?? "",
    remarks: existing?.remarks ?? "",
    note: "Stubbed data — set GSP_API_KEY + GSP_BASE_URL env vars to fetch live from GSTN via your GSP provider.",
  });
}
