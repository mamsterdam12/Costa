import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Costa Community",
  description:
    "De community voor huiseigenaren in Spanje: forum, ledendirectory, marktplaats en nieuws.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body className="flex min-h-screen flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
