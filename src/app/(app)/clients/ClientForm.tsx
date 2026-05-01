"use client";

import { useState } from "react";
import { createClientAction, updateClientAction } from "./actions";
import { validateGstin } from "@/lib/gstin";

type ClientLike = {
  id?: string;
  legalName?: string;
  tradeName?: string | null;
  gstin?: string;
  pan?: string;
  filingFrequency?: string;
  registrationType?: string;
  sector?: string | null;
  turnoverCrore?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  notes?: string | null;
  gstPortalUsername?: string | null;
  hasGstPortalPassword?: boolean;
};

export default function ClientForm({
  mode,
  client,
  canEditCredentials,
}: {
  mode: "create" | "edit";
  client?: ClientLike;
  canEditCredentials: boolean;
}) {
  const [gstin, setGstin] = useState(client?.gstin ?? "");
  const [pan, setPan] = useState(client?.pan ?? "");
  const [stateLabel, setStateLabel] = useState<string>("");
  const [gstinError, setGstinError] = useState<string>("");

  function onGstinChange(v: string) {
    const upper = v.toUpperCase();
    setGstin(upper);
    if (upper.length === 15) {
      const r = validateGstin(upper);
      if (r.ok) {
        setStateLabel(`${r.stateCode} — ${r.state}`);
        setPan(r.pan);
        setGstinError("");
      } else {
        setStateLabel("");
        setGstinError(r.error);
      }
    } else {
      setStateLabel("");
      setGstinError("");
    }
  }

  return (
    <form action={mode === "create" ? createClientAction : updateClientAction} className="card p-6 space-y-5">
      {client?.id ? <input type="hidden" name="id" value={client.id} /> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">GSTIN *</label>
          <input
            name="gstin"
            value={gstin}
            onChange={(e) => onGstinChange(e.target.value)}
            className="input font-mono"
            maxLength={15}
            required
          />
          {stateLabel ? <p className="mt-1 text-xs text-green-700">✓ State: {stateLabel}</p> : null}
          {gstinError ? <p className="mt-1 text-xs text-red-700">{gstinError}</p> : null}
        </div>
        <div>
          <label className="label">PAN *</label>
          <input
            name="pan"
            value={pan}
            onChange={(e) => setPan(e.target.value.toUpperCase())}
            className="input font-mono"
            maxLength={10}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Legal Name *</label>
          <input name="legalName" defaultValue={client?.legalName} className="input" required />
        </div>
        <div>
          <label className="label">Trade Name</label>
          <input name="tradeName" defaultValue={client?.tradeName ?? ""} className="input" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="label">Registration Type</label>
          <select name="registrationType" defaultValue={client?.registrationType ?? "REGULAR"} className="input">
            <option value="REGULAR">Regular</option>
            <option value="COMPOSITION">Composition</option>
            <option value="SEZ">SEZ</option>
            <option value="CASUAL">Casual</option>
            <option value="ISD">ISD</option>
            <option value="TDS">TDS</option>
            <option value="TCS">TCS</option>
            <option value="NRTP">NRTP</option>
          </select>
        </div>
        <div>
          <label className="label">Filing Frequency</label>
          <select name="filingFrequency" defaultValue={client?.filingFrequency ?? "MONTHLY"} className="input">
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly (QRMP)</option>
          </select>
        </div>
        <div>
          <label className="label">Turnover (₹ Cr)</label>
          <input name="turnoverCrore" type="number" step="0.01" defaultValue={client?.turnoverCrore ?? ""} className="input" />
        </div>
      </div>

      <div>
        <label className="label">Sector / Business</label>
        <input name="sector" defaultValue={client?.sector ?? ""} className="input" placeholder="e.g. Manufacturing, IT services" />
      </div>

      <fieldset className="border-t pt-4">
        <legend className="text-sm font-semibold text-slate-700 mb-3">Contact</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Contact Name</label>
            <input name="contactName" defaultValue={client?.contactName ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="contactEmail" type="email" defaultValue={client?.contactEmail ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="contactPhone" defaultValue={client?.contactPhone ?? ""} className="input" />
          </div>
        </div>
      </fieldset>

      <fieldset className="border-t pt-4">
        <legend className="text-sm font-semibold text-slate-700 mb-3">Address</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Address Line 1</label>
            <input name="addressLine1" defaultValue={client?.addressLine1 ?? ""} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address Line 2</label>
            <input name="addressLine2" defaultValue={client?.addressLine2 ?? ""} className="input" />
          </div>
          <div>
            <label className="label">City</label>
            <input name="city" defaultValue={client?.city ?? ""} className="input" />
          </div>
          <div>
            <label className="label">Pincode</label>
            <input name="pincode" defaultValue={client?.pincode ?? ""} className="input" maxLength={6} />
          </div>
        </div>
      </fieldset>

      {canEditCredentials ? (
        <fieldset className="border-t pt-4">
          <legend className="text-sm font-semibold text-slate-700 mb-1">GST Portal Credentials</legend>
          <p className="text-xs text-slate-500 mb-3">
            Stored encrypted (AES-256-GCM). Used to log into gst.gov.in on behalf of the client.
            {mode === "edit" ? " Leave password blank to keep the current one unchanged." : ""}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Portal User ID</label>
              <input
                name="gstPortalUsername"
                defaultValue={client?.gstPortalUsername ?? ""}
                className="input font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="label">
                Portal Password{" "}
                {mode === "edit" && client?.hasGstPortalPassword ? (
                  <span className="text-xs font-normal text-slate-500">(saved — leave blank to keep)</span>
                ) : null}
              </label>
              <input
                name="gstPortalPassword"
                type="password"
                placeholder={mode === "edit" && client?.hasGstPortalPassword ? "••••••••" : ""}
                className="input font-mono"
                autoComplete="new-password"
              />
            </div>
          </div>
        </fieldset>
      ) : null}

      <div>
        <label className="label">Notes</label>
        <textarea name="notes" defaultValue={client?.notes ?? ""} rows={3} className="input" />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-primary" type="submit" disabled={!!gstinError || gstin.length !== 15}>
          {mode === "create" ? "Create Client" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
