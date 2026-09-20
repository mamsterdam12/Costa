import { members } from "@/lib/data";

export const metadata = {
  title: "Ledendirectory — Costa Community",
};

export default function DirectoryPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold text-sea-900">Ledendirectory</h1>
      <p className="mt-2 max-w-2xl text-sea-900/70">
        Maak kennis met andere huiseigenaren in jouw regio en bouw je eigen
        netwerk op langs de Spaanse kust.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => (
          <div key={member.id} className="rounded-xl border border-sea-100 bg-white p-6">
            <h2 className="text-lg font-semibold text-sea-600">{member.name}</h2>
            <p className="text-sm text-sea-900/50">
              {member.region}, {member.province} · lid sinds {member.since}
            </p>
            <p className="mt-3 text-sm text-sea-900/80">{member.bio}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {member.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-sea-50 px-3 py-1 text-xs font-medium text-sea-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
