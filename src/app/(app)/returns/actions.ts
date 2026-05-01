"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, logActivity } from "@/lib/auth";
import { can, RETURN_TYPES, type ReturnType, type FilingFrequency } from "@/lib/constants";
import { calculateDueDate, deriveStatus } from "@/lib/gst";

export async function createReturnAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "write")) redirect("/returns?error=No+permission");

  const clientId = String(formData.get("clientId") || "");
  const type = String(formData.get("type") || "") as ReturnType;
  const period = String(formData.get("period") || "");
  const remarks = String(formData.get("remarks") || "");

  if (!clientId || !type || !period) redirect("/returns?error=Missing+fields");
  if (!RETURN_TYPES.includes(type)) redirect("/returns?error=Invalid+type");

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) redirect("/returns?error=Client+not+found");

  const due = calculateDueDate(type, period, client.filingFrequency as FilingFrequency);
  const status = deriveStatus(null, due);

  try {
    const r = await prisma.return.create({
      data: { clientId, type, period, dueDate: due, status, remarks: remarks || null },
    });
    await logActivity(user.id, "return.create", "Return", r.id, { type, period });
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message.includes("Unique") ? "Return already exists for this period" : "Failed";
    redirect(`/returns?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/returns");
  revalidatePath("/dashboard");
  redirect("/returns");
}

export async function markFiledAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "write")) redirect("/returns?error=No+permission");
  const id = String(formData.get("id") || "");
  const arn = String(formData.get("arn") || "").trim();
  if (!id) redirect("/returns");

  await prisma.return.update({
    where: { id },
    data: {
      status: "FILED",
      filedAt: new Date(),
      filedById: user.id,
      arn: arn || null,
    },
  });
  await logActivity(user.id, "return.markFiled", "Return", id, { arn });
  revalidatePath("/returns");
  revalidatePath("/dashboard");
  redirect("/returns");
}

export async function deleteReturnAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "delete")) redirect("/returns?error=No+permission");
  const id = String(formData.get("id") || "");
  if (!id) redirect("/returns");
  await prisma.return.delete({ where: { id } });
  await logActivity(user.id, "return.delete", "Return", id);
  revalidatePath("/returns");
  redirect("/returns");
}

export async function refreshStatusesAction() {
  const user = await requireUser();
  if (!can(user.role, "write")) redirect("/returns");
  const now = new Date();
  await prisma.$transaction([
    prisma.return.updateMany({
      where: { status: "PENDING", dueDate: { lt: now } },
      data: { status: "OVERDUE" },
    }),
  ]);
  revalidatePath("/returns");
  revalidatePath("/dashboard");
  redirect("/returns");
}
