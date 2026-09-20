import Link from "next/link";
import { forumPosts } from "@/lib/data";

export const metadata = {
  title: "Forum — Costa Community",
};

export default function ForumPage() {
  const categories = Array.from(new Set(forumPosts.map((p) => p.category)));

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-sea-900">Forum</h1>
          <p className="mt-2 text-sea-900/70">
            Vragen, tips en discussies van huiseigenaren in heel Spanje.
          </p>
        </div>
        <button className="w-fit rounded-full bg-sun-500 px-5 py-2 font-semibold text-sea-900 hover:bg-sun-400">
          Nieuw topic
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {categories.map((category) => (
          <span
            key={category}
            className="rounded-full border border-sea-100 bg-white px-3 py-1 text-xs font-medium text-sea-600"
          >
            {category}
          </span>
        ))}
      </div>

      <ul className="mt-8 divide-y divide-sea-100 rounded-xl border border-sea-100 bg-white">
        {forumPosts.map((post) => (
          <li key={post.id} className="p-5">
            <Link href={`/forum/${post.id}`} className="text-lg font-semibold text-sea-600 hover:underline">
              {post.title}
            </Link>
            <p className="mt-1 text-sm text-sea-900/70">{post.excerpt}</p>
            <p className="mt-2 text-xs text-sea-900/50">
              {post.category} · gestart door {post.author} · {post.region} ·{" "}
              {post.replies} reacties · laatste activiteit {post.lastActivity}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
