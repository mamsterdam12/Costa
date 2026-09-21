"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { defaultLocale, isLocale, ui, type Locale } from "@/lib/i18n";

// Hamburger menu in the site header. Client-side only because it needs
// open/closed state; reads ?lang from the URL so links keep the chosen
// language.
export default function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lang = searchParams.get("lang");
  const locale: Locale = isLocale(lang ?? undefined) ? (lang as Locale) : defaultLocale;
  const qs = lang ? `?lang=${lang}` : "";

  const items = [
    { href: `/marbella${qs}`, label: ui.events[locale], active: !["/bronnen", "/scripts"].includes(pathname) },
    { href: `/bronnen${qs}`, label: ui.sources[locale], active: pathname === "/bronnen" },
    { href: `/scripts${qs}`, label: ui.scripts[locale], active: pathname === "/scripts" },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={ui.menu[locale]}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg border border-sea-100 bg-white"
      >
        <span className="h-0.5 w-5 bg-sea-900" />
        <span className="h-0.5 w-5 bg-sea-900" />
        <span className="h-0.5 w-5 bg-sea-900" />
      </button>

      {open && (
        <nav className="absolute right-0 z-10 mt-2 w-48 overflow-hidden rounded-xl border border-sea-100 bg-white shadow-lg">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm font-medium hover:bg-sun-50 ${
                item.active ? "text-sun-600" : "text-sea-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
