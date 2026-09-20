import Link from "next/link";
import { notFound } from "next/navigation";
import { forumPosts } from "@/lib/data";

export function generateStaticParams() {
  return forumPosts.map((post) => ({ id: post.id }));
}

export default async function ForumPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = forumPosts.find((p) => p.id === id);
  if (!post) notFound();

  return (
    <article>
      <Link href="/forum" className="text-sm font-medium text-sun-600 hover:underline">
        &larr; Terug naar forum
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-sea-900">{post.title}</h1>
      <p className="mt-2 text-sm text-sea-900/50">
        {post.category} · gestart door {post.author} · {post.region} ·{" "}
        {post.replies} reacties · laatste activiteit {post.lastActivity}
      </p>
      <div className="mt-6 rounded-xl border border-sea-100 bg-white p-6 text-sea-900/90">
        {post.body}
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-sea-100 p-6 text-sm text-sea-900/50">
        Reacties en het plaatsen van nieuwe berichten komen in een volgende
        fase, zodra login en de database zijn aangesloten.
      </div>
    </article>
  );
}
