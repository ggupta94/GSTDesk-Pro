"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, logActivity } from "@/lib/auth";
import { can, REGISTRATION_TYPES } from "@/lib/constants";
import { validateGstin, isValidPan } from "@/lib/gstin";

const ClientInput = z.object({
  legalName: z.string().min(2),
  tradeName: z.string().optional(),
  gstin: z.string().length(15),
  pan: z.string().length(10),
  filingFrequency: z.enum(["MONTHLY", "QUARTERLY"]),
  registrationType: z.enum(REGISTRATION_TYPES),
  sector: z.string().optional(),
  turnoverCrore: z.coerce.number().nonnegative().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  pincode: z.string().optional(),
  notes: z.string().optional(),
});

function nullifyEmpty<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out) as Array<keyof T>) {
    if (out[k] === "" || out[k] === undefined) {
      delete out[k];
    }
  }
  return out;
}

export async function createClientAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "write")) redirect("/clients?error=No+permission");

  const raw = Object.fromEntries(formData.entries());
  const parsed = ClientInput.safeParse(raw);
  if (!parsed.success) {
    redirect(`/clients/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  const data = parsed.data;

  const gv = validateGstin(data.gstin);
  if (!gv.ok) redirect(`/clients/new?error=${encodeURIComponent(gv.error)}`);
  if (!isValidPan(data.pan)) redirect(`/clients/new?error=Invalid+PAN+format`);

  if (gv.pan !== data.pan.toUpperCase()) {
    redirect(`/clients/new?error=PAN+does+not+match+GSTIN`);
  }

  try {
    const created = await prisma.client.create({
      data: {
        ...nullifyEmpty(data),
        gstin: data.gstin.toUpperCase(),
        pan: data.pan.toUpperCase(),
        stateCode: gv.stateCode,
        state: gv.state,
      },
    });
    await logActivity(user.id, "client.create", "Client", created.id, {
      legalName: created.legalName,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message.includes("Unique") ? "GSTIN already exists" : "Failed to create";
    redirect(`/clients/new?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/clients");
  redirect("/clients");
}

export async function updateClientAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "write")) redirect("/clients?error=No+permission");
  const id = String(formData.get("id") || "");
  if (!id) redirect("/clients");

  const raw = Object.fromEntries(formData.entries());
  const parsed = ClientInput.safeParse(raw);
  if (!parsed.success) {
    redirect(`/clients/${id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  const data = parsed.data;
  const gv = validateGstin(data.gstin);
  if (!gv.ok) redirect(`/clients/${id}/edit?error=${encodeURIComponent(gv.error)}`);

  await prisma.client.update({
    where: { id },
    data: {
      ...nullifyEmpty(data),
      gstin: data.gstin.toUpperCase(),
      pan: data.pan.toUpperCase(),
      stateCode: gv.stateCode,
      state: gv.state,
    },
  });
  await logActivity(user.id, "client.update", "Client", id);
  revalidatePath("/clients");
  redirect(`/clients/${id}`);
}

export async function deleteClientAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "delete")) redirect("/clients?error=No+permission");
  const id = String(formData.get("id") || "");
  if (!id) redirect("/clients");
  await prisma.client.delete({ where: { id } });
  await logActivity(user.id, "client.delete", "Client", id);
  revalidatePath("/clients");
  redirect("/clients");
}

