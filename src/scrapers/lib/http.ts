// Low-level HTTP only. Everything about politeness, caching and fallback
// lives in fetcher.ts -- scrapers should use that, not this.

export const USER_AGENT_TOKEN = "CostaCommunityBot";
// Identifies as a bot (honest) but in the "Mozilla/5.0 (compatible; ...)"
// shape that site firewalls actually recognise -- a bare token got us a
// ~180-byte stub instead of the page from thefarm-marbella.com.
export const USER_AGENT = `Mozilla/5.0 (compatible; ${USER_AGENT_TOKEN}/0.1; +https://costa-production-f0e2.up.railway.app)`;

export type RawResponse = {
  url: string;
  html: string;
  status: number;
  contentType: string;
  etag?: string;
  lastModified?: string;
};

export async function rawFetch(
  url: string,
  timeoutMs = 15000,
  extraHeaders: Record<string, string> = {}
): Promise<RawResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "accept-language": "en-GB,en;q=0.9,es;q=0.8,nl;q=0.7",
        ...extraHeaders,
      },
      signal: controller.signal,
      redirect: "follow",
    });
    // 304 is a successful answer to a conditional request, not a failure.
    if (!res.ok && res.status !== 304) throw new Error(`HTTP ${res.status} for ${url}`);
    return {
      url: res.url || url,
      html: res.status === 304 ? "" : await res.text(),
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      etag: res.headers.get("etag") ?? undefined,
      lastModified: res.headers.get("last-modified") ?? undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

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
