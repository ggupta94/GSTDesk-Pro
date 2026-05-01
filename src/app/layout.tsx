import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GSTDesk Pro",
  description: "GST management for CA offices — clients, returns, ITC, invoices",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
