import { deploymentId, gitCommitSha, startedAt } from "@/lib/deploymentInfo";

// Tiny always-present footer so it's obvious which deployment is being
// viewed -- e.g. after a Railway deploy that looks like it should have
// changed something but the page doesn't look different yet.
export default function Footer() {
  const shortId = deploymentId ? deploymentId.slice(0, 8) : "local";
  const shortSha = gitCommitSha ? gitCommitSha.slice(0, 7) : null;

  return (
    <footer className="mt-auto border-t border-sea-100 px-4 py-3 text-center text-[11px] text-sea-900/40">
      deployment {shortId}
      {shortSha && ` · ${shortSha}`} · {new Date(startedAt).toLocaleString("nl")}
    </footer>
  );
}
