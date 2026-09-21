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
  /** Set when the response is an anti-bot challenge rather than content. */
  challenge?: string;
};

// A site putting a CAPTCHA in front of us is telling us not to automate
// it. We identify the challenge so the failure is reported honestly, and
// deliberately stop there rather than trying to get past it.
export function detectChallenge(html: string, url: string): string | null {
  if (/sgcaptcha/i.test(html) || /sgcaptcha/i.test(url)) {
    return "SiteGround bot protection (sgcaptcha)";
  }
  if (/cdn-cgi\/challenge|challenge-platform|__cf_chl/i.test(html)) return "Cloudflare challenge";
  if (/\b(captcha|challenge)\b/i.test(url)) return "bot challenge page";
  if (html.length < 2048 && /<meta[^>]+refresh/i.test(html) && /captcha|challenge|verify/i.test(html)) {
    return "bot challenge redirect";
  }
  return null;
}

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
  let challenge = detectChallenge(res.html, res.url);
  while (!challenge && hops < 3) {
    const next = metaRefreshTarget(res.html, res.url);
    if (!next || next === res.url) break;
    challenge = detectChallenge("", next);
    if (challenge) break; // don't walk into a CAPTCHA
    res = await fetchOnce(next, timeoutMs);
    hops++;
    challenge = detectChallenge(res.html, res.url);
  }
  return {
    url: res.url,
    html: res.html,
    status: res.status,
    contentType: res.contentType,
    hops,
    challenge: challenge ?? undefined,
  };
}

export function metaRefreshTarget(html: string, base: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/http-equiv\s*=\s*["']?refresh["']?/i.test(tag)) continue;
    // Quote-aware: content="3; URL='https://...'" nests the other quote.
    const m = /content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const content = m?.[1] ?? m?.[2] ?? m?.[3];
    if (!content) continue;
    // Browsers accept both "0; url=/x" and the shorthand "0;/x" -- the
    // latter is what SiteGround's bot challenge emits.
    const target = (
      /url\s*=\s*["']?([^"';\s]+)/i.exec(content)?.[1] ?? /^\s*[\d.]+\s*;\s*(\S+)/.exec(content)?.[1]
    )?.trim();
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
