import { listings } from "@/lib/data";

export const metadata = {
  title: "Marktplaats — Costa Community",
};

export default function MarketplacePage() {
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-sea-900">Marktplaats</h1>
          <p className="mt-2 max-w-2xl text-sea-900/70">
            Door de community aanbevolen dienstverleners: van klussers tot
            gestorías en makelaars.
          </p>
        </div>
        <button className="w-fit rounded-full bg-sun-500 px-5 py-2 font-semibold text-sea-900 hover:bg-sun-400">
          Dienst aanmelden
        </button>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {listings.map((listing) => (
          <div key={listing.id} className="rounded-xl border border-sea-100 bg-white p-6">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-sea-600">{listing.name}</h2>
              <span className="text-sm font-medium text-sun-600">★ {listing.rating}</span>
            </div>
            <p className="text-sm text-sea-900/50">
              {listing.category} · {listing.region}
            </p>
            <p className="mt-3 text-sm text-sea-900/80">{listing.description}</p>
            <p className="mt-4 text-sm font-medium text-sea-600">{listing.contact}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
