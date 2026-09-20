import { articles, events } from "@/lib/data";

export const metadata = {
  title: "Nieuws & Evenementen — Costa Community",
};

export default function NewsPage() {
  return (
    <div className="space-y-16">
      <section>
        <h1 className="text-3xl font-bold text-sea-900">Nieuws</h1>
        <p className="mt-2 max-w-2xl text-sea-900/70">
          Praktische updates over regelgeving, belastingen en wonen in
          Spanje.
        </p>
        <div className="mt-8 space-y-6">
          {articles.map((article) => (
            <article key={article.id} className="rounded-xl border border-sea-100 bg-white p-6">
              <p className="text-xs text-sea-900/50">{article.date}</p>
              <h2 className="mt-1 text-xl font-semibold text-sea-600">{article.title}</h2>
              <p className="mt-2 text-sm text-sea-900/80">{article.content}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-3xl font-bold text-sea-900">Evenementen</h2>
        <p className="mt-2 max-w-2xl text-sea-900/70">
          Kom langs bij lokale meet-ups en informatieavonden.
        </p>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.id} className="rounded-xl border border-sea-100 bg-white p-6">
              <h3 className="text-lg font-semibold text-sea-600">{event.title}</h3>
              <p className="mt-1 text-sm text-sea-900/50">
                {event.date} · {event.location}
              </p>
              <p className="mt-3 text-sm text-sea-900/80">{event.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
