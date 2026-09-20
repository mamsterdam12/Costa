import Link from "next/link";

const links = [
  { href: "/forum", label: "Forum" },
  { href: "/directory", label: "Leden" },
  { href: "/marketplace", label: "Marktplaats" },
  { href: "/news", label: "Nieuws & Evenementen" },
];

export default function Navbar() {
  return (
    <header className="border-b border-sea-100 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-xl font-bold text-sea-600">
          Costa<span className="text-sun-500">Community</span>
        </Link>
        <nav className="flex gap-6 text-sm font-medium text-sea-900">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-sun-500">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
