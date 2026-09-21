// Identifies as a bot (honest) but in the "Mozilla/5.0 (compatible; ...)"
// shape that site firewalls actually recognise -- a bare "CostaCommunityBot/0.1"
// got us a ~180-byte stub instead of the page from thefarm-marbella.com.
const USER_AGENT =
  "Mozilla/5.0 (compatible; CostaCommunityBot/0.1; +https://costa-production-f0e2.up.railway.app)";

export type FetchedPage = {
  /** Final URL after any redirects -- resolve relative links against this. */
  url: string;
  html: string;
  status: number;
  contentType: string;
  /** How many meta-refresh hops were followed. */
  hops: number;
};

async function fetchOnce(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-GB,en;q=0.9,es;q=0.8,nl;q=0.7",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return {
      html: await res.text(),
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      url: res.url || url,
    };
  } finally {
    clearTimeout(timer);
  }
}

// `fetch` follows HTTP 3xx but not <meta http-equiv="refresh">, which is
// how some sites bounce non-browser clients -- that lands you on a tiny
// stub page with no content. Follow those too, within a hop limit.
export async function fetchPage(url: string, timeoutMs = 15000): Promise<FetchedPage> {
  let res = await fetchOnce(url, timeoutMs);
  let hops = 0;
  while (hops < 3) {
    const next = metaRefreshTarget(res.html, res.url);
    if (!next || next === res.url) break;
    res = await fetchOnce(next, timeoutMs);
    hops++;
  }
  return { url: res.url, html: res.html, status: res.status, contentType: res.contentType, hops };
}

export function metaRefreshTarget(html: string, base: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/http-equiv\s*=\s*["']?refresh["']?/i.test(tag)) continue;
    // Quote-aware: content="3; URL='https://...'" nests the other quote.
    const m = /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const content = m?.[1] ?? m?.[2] ?? m?.[3];
    const target = content && /url\s*=\s*["']?([^"';\s]+)/i.exec(content)?.[1]?.trim();
    if (!target) continue;
    try {
      return new URL(target, base).toString();
    } catch {
      return null;
    }
  }
  return null;
}

export async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  return (await fetchPage(url, timeoutMs)).html;
}

export async function fetchJson<T = unknown>(url: string, timeoutMs = 15000): Promise<T> {
  return JSON.parse(await fetchText(url, timeoutMs)) as T;
}
