"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, logActivity } from "@/lib/auth";
import { can, ITC_ELIGIBILITY } from "@/lib/constants";

const ITCInput = z.object({
  clientId: z.string().min(1),
  period: z.string().min(4),
  igstAvailable: z.coerce.number().nonnegative(),
  cgstAvailable: z.coerce.number().nonnegative(),
  sgstAvailable: z.coerce.number().nonnegative(),
  igstUtilised: z.coerce.number().nonnegative(),
  cgstUtilised: z.coerce.number().nonnegative(),
  sgstUtilised: z.coerce.number().nonnegative(),
  eligibility: z.enum(ITC_ELIGIBILITY),
  blockedReason: z.string().optional(),
  remarks: z.string().optional(),
});

export async function upsertITCAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "write")) redirect("/itc?error=No+permission");
  const raw = Object.fromEntries(formData.entries());
  const parsed = ITCInput.safeParse(raw);
  if (!parsed.success) redirect(`/itc?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const data = parsed.data;

  if (data.igstUtilised > data.igstAvailable + 0.01) redirect("/itc?error=IGST+utilised+exceeds+available");
  if (data.cgstUtilised > data.cgstAvailable + 0.01) redirect("/itc?error=CGST+utilised+exceeds+available");
  if (data.sgstUtilised > data.sgstAvailable + 0.01) redirect("/itc?error=SGST+utilised+exceeds+available");

  await prisma.iTCRecord.upsert({
    where: { clientId_period: { clientId: data.clientId, period: data.period } },
    create: {
      clientId: data.clientId,
      period: data.period,
      igstAvailable: data.igstAvailable,
      cgstAvailable: data.cgstAvailable,
      sgstAvailable: data.sgstAvailable,
      igstUtilised: data.igstUtilised,
      cgstUtilised: data.cgstUtilised,
      sgstUtilised: data.sgstUtilised,
      eligibility: data.eligibility,
      blockedReason: data.blockedReason || null,
      remarks: data.remarks || null,
    },
    update: {
      igstAvailable: data.igstAvailable,
      cgstAvailable: data.cgstAvailable,
      sgstAvailable: data.sgstAvailable,
      igstUtilised: data.igstUtilised,
      cgstUtilised: data.cgstUtilised,
      sgstUtilised: data.sgstUtilised,
      eligibility: data.eligibility,
      blockedReason: data.blockedReason || null,
      remarks: data.remarks || null,
    },
  });
  await logActivity(user.id, "itc.upsert", "ITCRecord", `${data.clientId}:${data.period}`);
  revalidatePath("/itc");
  redirect("/itc");
}

export async function deleteITCAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "delete")) redirect("/itc?error=No+permission");
  const id = String(formData.get("id") || "");
  if (!id) redirect("/itc");
  await prisma.iTCRecord.delete({ where: { id } });
  await logActivity(user.id, "itc.delete", "ITCRecord", id);
  revalidatePath("/itc");
  redirect("/itc");
}
