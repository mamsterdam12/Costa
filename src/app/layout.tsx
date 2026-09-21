import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Costa Community — Events",
  description: "Lokale events, per regio, in jouw taal.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
