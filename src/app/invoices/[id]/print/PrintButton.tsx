"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        padding: "6px 12px",
        background: "#2563eb",
        color: "white",
        border: 0,
        borderRadius: 6,
        cursor: "pointer",
        zIndex: 50,
      }}
      className="no-print"
    >
      Print / Save as PDF
    </button>
  );
}
