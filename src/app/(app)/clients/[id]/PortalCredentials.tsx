"use client";

import { useState } from "react";

export default function PortalCredentials({
  username,
  password,
  canEdit,
  editHref,
}: {
  username: string | null;
  password: string;
  canEdit: boolean;
  editHref: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copiedField, setCopiedField] = useState<"u" | "p" | null>(null);

  async function copy(value: string, which: "u" | "p") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(which);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      /* clipboard not available */
    }
  }

  if (!username && !password) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-slate-900">GST Portal Credentials</h2>
          {canEdit ? (
            <a href={editHref} className="text-xs text-brand-600 hover:underline">
              Add credentials →
            </a>
          ) : null}
        </div>
        <p className="text-sm text-slate-500">
          No portal credentials saved for this client yet.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            GST Portal Credentials
          </h2>
          <p className="text-xs text-slate-500">
            Encrypted at rest · gst.gov.in login
          </p>
        </div>
        {canEdit ? (
          <a href={editHref} className="text-xs text-brand-600 hover:underline">
            Edit
          </a>
        ) : null}
      </div>

      <div className="space-y-3">
        <Row
          label="User ID"
          value={username ?? "—"}
          show
          onCopy={() => username && copy(username, "u")}
          copied={copiedField === "u"}
        />
        <Row
          label="Password"
          value={password || "—"}
          show={revealed}
          masked={password ? "•".repeat(Math.min(12, password.length)) : "—"}
          onToggle={() => setRevealed((v) => !v)}
          onCopy={() => password && copy(password, "p")}
          copied={copiedField === "p"}
        />
      </div>

      <div className="mt-3 rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-800">
        <strong>Sensitive.</strong> Don&apos;t share screenshots of this page externally.
        Access is logged and limited to CA + Article roles.
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  show,
  masked,
  onToggle,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  show: boolean;
  masked?: string;
  onToggle?: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <code className="flex-1 rounded-md bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-sm font-mono text-slate-900 break-all">
        {show ? value : (masked ?? value)}
      </code>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          className="text-xs px-2 py-1 rounded-md ring-1 ring-slate-300 hover:bg-slate-50"
        >
          {show ? "Hide" : "Show"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onCopy}
        className="text-xs px-2 py-1 rounded-md ring-1 ring-slate-300 hover:bg-slate-50"
        disabled={value === "—"}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
