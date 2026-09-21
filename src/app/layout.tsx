import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Footer from "@/components/Footer";
import SiteNav from "@/components/SiteNav";
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
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-sea-100 bg-white/80">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold text-sea-900">
              Costa Community
            </Link>
            {/* useSearchParams in SiteNav needs a Suspense boundary for the
                statically prerendered routes (/, /_not-found). */}
            <Suspense fallback={<div className="h-10 w-10" />}>
              <SiteNav />
            </Suspense>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
