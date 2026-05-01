"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, logActivity } from "@/lib/auth";
import { can, REGISTRATION_TYPES } from "@/lib/constants";
import { validateGstin, isValidPan } from "@/lib/gstin";
import { encryptSecret } from "@/lib/crypto";

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
  gstPortalUsername: z.string().optional(),
  gstPortalPassword: z.string().optional(),
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
    const { gstPortalPassword, ...rest } = data;
    const cleaned = nullifyEmpty(rest);
    const created = await prisma.client.create({
      data: {
        ...cleaned,
        gstin: data.gstin.toUpperCase(),
        pan: data.pan.toUpperCase(),
        stateCode: gv.stateCode,
        state: gv.state,
        gstPortalPasswordEnc: gstPortalPassword ? encryptSecret(gstPortalPassword) : null,
      },
    });
    if (gstPortalPassword || data.gstPortalUsername) {
      await logActivity(user.id, "client.create.withCredentials", "Client", created.id, {
        legalName: created.legalName,
      });
    } else {
      await logActivity(user.id, "client.create", "Client", created.id, {
        legalName: created.legalName,
      });
    }
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

  const { gstPortalPassword, ...rest } = data;
  const cleaned = nullifyEmpty(rest);
  // Only CAs can change credentials. Articles/Staff edits keep existing values.
  const credentialsUpdate: { gstPortalUsername?: string | null; gstPortalPasswordEnc?: string | null } = {};
  if (can(user.role, "editCredentials")) {
    if ("gstPortalUsername" in cleaned) {
      credentialsUpdate.gstPortalUsername = (cleaned.gstPortalUsername as string) || null;
    }
    if (typeof gstPortalPassword === "string" && gstPortalPassword.length > 0) {
      credentialsUpdate.gstPortalPasswordEnc = encryptSecret(gstPortalPassword);
    }
    // empty password input means "no change"; never wipe by accident
  }
  // strip credential keys from the cleaned shallow data so we don't send mismatched typing
  delete (cleaned as Record<string, unknown>).gstPortalUsername;

  await prisma.client.update({
    where: { id },
    data: {
      ...cleaned,
      gstin: data.gstin.toUpperCase(),
      pan: data.pan.toUpperCase(),
      stateCode: gv.stateCode,
      state: gv.state,
      ...credentialsUpdate,
    },
  });
  await logActivity(
    user.id,
    Object.keys(credentialsUpdate).length > 0 ? "client.update.credentials" : "client.update",
    "Client",
    id
  );
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

