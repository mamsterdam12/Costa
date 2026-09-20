import Link from "next/link";
import { forumPosts, listings, events } from "@/lib/data";

const highlights = [
  {
    title: "Forum",
    href: "/forum",
    description: "Discussieer over belasting, klussen, regelgeving en het leven in Spanje.",
  },
  {
    title: "Ledendirectory",
    href: "/directory",
    description: "Vind en maak contact met andere huiseigenaren in jouw regio.",
  },
  {
    title: "Marktplaats",
    href: "/marketplace",
    description: "Betrouwbare dienstverleners: van zwembadonderhoud tot gestorías.",
  },
  {
    title: "Nieuws & Evenementen",
    href: "/news",
    description: "Blijf op de hoogte van regelgeving en kom naar lokale meet-ups.",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-16">
      <section className="rounded-2xl bg-gradient-to-br from-sea-600 to-sea-900 px-8 py-16 text-white">
        <h1 className="max-w-2xl text-4xl font-bold sm:text-5xl">
          De community voor huiseigenaren in Spanje
        </h1>
        <p className="mt-4 max-w-xl text-lg text-sea-50">
          Alles wat je nodig hebt om zorgeloos te genieten van je huis aan de
          Costa: praktische kennis, betrouwbare dienstverleners en contact
          met medebewoners.
        </p>
        <div className="mt-8 flex gap-4">
          <Link
            href="/forum"
            className="rounded-full bg-sun-500 px-6 py-3 font-semibold text-sea-900 hover:bg-sun-400"
          >
            Ga naar het forum
          </Link>
          <Link
            href="/directory"
            className="rounded-full border border-white/40 px-6 py-3 font-semibold hover:bg-white/10"
          >
            Ontmoet leden
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-sea-900">Alles er op en er aan</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl border border-sea-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              <h3 className="text-lg font-semibold text-sea-600">{item.title}</h3>
              <p className="mt-2 text-sm text-sea-900/80">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-sea-900">Recente forumtopics</h2>
            <Link href="/forum" className="text-sm font-medium text-sun-600 hover:underline">
              Alle topics
            </Link>
          </div>
          <ul className="mt-4 space-y-4">
            {forumPosts.slice(0, 3).map((post) => (
              <li key={post.id} className="rounded-lg border border-sea-100 bg-white p-4">
                <Link href={`/forum/${post.id}`} className="font-semibold text-sea-600 hover:underline">
                  {post.title}
                </Link>
                <p className="mt-1 text-sm text-sea-900/70">{post.excerpt}</p>
                <p className="mt-2 text-xs text-sea-900/50">
                  {post.category} · {post.region} · {post.replies} reacties
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-sea-900">Aankomende evenementen</h2>
            <Link href="/news" className="text-sm font-medium text-sun-600 hover:underline">
              Alle evenementen
            </Link>
          </div>
          <ul className="mt-4 space-y-4">
            {events.map((event) => (
              <li key={event.id} className="rounded-lg border border-sea-100 bg-white p-4">
                <p className="font-semibold text-sea-600">{event.title}</p>
                <p className="mt-1 text-sm text-sea-900/70">{event.description}</p>
                <p className="mt-2 text-xs text-sea-900/50">
                  {event.date} · {event.location}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-sea-900">Uitgelichte diensten</h2>
            <Link href="/marketplace" className="text-sm font-medium text-sun-600 hover:underline">
              Marktplaats
            </Link>
          </div>
          <ul className="mt-4 space-y-4">
            {listings.slice(0, 2).map((listing) => (
              <li key={listing.id} className="rounded-lg border border-sea-100 bg-white p-4">
                <p className="font-semibold text-sea-600">{listing.name}</p>
                <p className="mt-1 text-sm text-sea-900/70">{listing.description}</p>
                <p className="mt-2 text-xs text-sea-900/50">
                  {listing.category} · {listing.region} · ★ {listing.rating}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
