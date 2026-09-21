import { stripTags } from "./html";

// When a parser finds nothing, this describes what the page actually
// looks like -- headings, class names, embedded scripts/iframes, the
// first stretch of visible text -- so whoever (or whatever) fixes the
// parser later can see the real structure in the logs without having to
// fetch the page themselves. Keeps each line short enough for log
// viewers; never throws.
export function diagnosePage(
  url: string,
  html: string,
  meta?: { requestedUrl?: string; status?: number; contentType?: string; hops?: number }
): string[] {
  const lines: string[] = [];
  if (meta) {
    lines.push(
      `[diagnose] fetch: requested=${meta.requestedUrl ?? url} final=${url} status=${meta.status ?? "?"} type="${meta.contentType ?? ""}" metaRefreshHops=${meta.hops ?? 0}`
    );
  }
  // The single most useful line when a page comes back unexpectedly
  // small: the actual bytes, so a stub/redirect/challenge is visible.
  lines.push(`[diagnose] raw head: ${JSON.stringify(html.slice(0, 400))}`);
  const grab = (re: RegExp, max: number) => {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < max) out.push(m[1]);
    return out;
  };

  const title = grab(/<title[^>]*>([\s\S]*?)<\/title>/i, 1)[0];
  const generator = grab(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']+)["']/i, 1)[0];
  lines.push(`[diagnose] ${url}: ${html.length} chars, title="${title ? stripTags(title) : ""}", generator="${generator ?? ""}"`);

  const scriptHosts = [...new Set(grab(/<script[^>]*src=["']([^"']+)["']/gi, 200).map(host))].filter(Boolean);
  lines.push(`[diagnose] script hosts: ${scriptHosts.join(", ") || "none"}`);

  const iframes = grab(/<iframe[^>]*src=["']([^"']+)["']/gi, 20);
  lines.push(`[diagnose] iframes: ${iframes.join(", ") || "none"}`);

  const headings = grab(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi, 40).map((h) => stripTags(h)).filter(Boolean);
  lines.push(`[diagnose] headings: ${headings.join(" | ") || "none"}`);

  const classNames = new Set<string>();
  for (const cls of grab(/class=["']([^"']+)["']/gi, 5000)) {
    for (const c of cls.split(/\s+/)) {
      if (/event|calendar|date|time|tribe|whats|agenda|schedule|day|month/i.test(c)) classNames.add(c);
    }
  }
  lines.push(`[diagnose] event-ish classes: ${[...classNames].slice(0, 60).join(" ") || "none"}`);

  lines.push(`[diagnose] <time> elements: ${(html.match(/<time\b/gi) ?? []).length}, <article>: ${(html.match(/<article\b/gi) ?? []).length}`);

  const body = html.split(/<body[^>]*>/i)[1] ?? html;
  const text = stripTags(body).replace(/\n{2,}/g, "\n");
  for (let i = 0; i < Math.min(text.length, 6000); i += 2000) {
    lines.push(`[diagnose] text ${i / 2000 + 1}/3: ${JSON.stringify(text.slice(i, i + 2000))}`);
  }
  return lines;
}

// Raw markup around the first occurrence of a marker (usually a class
// name), for when the structure matters and stripped text won't do.
export function excerptAround(html: string, marker: string, chars = 800): string[] {
  const at = html.indexOf(marker);
  if (at < 0) return [`[diagnose] "${marker}": not present`];
  const from = Math.max(0, at - 200);
  return [`[diagnose] "${marker}" @${at}: ${JSON.stringify(html.slice(from, from + chars))}`];
}

function host(src: string): string {
  try {
    return new URL(src, "https://x.invalid").hostname.replace(/^x\.invalid$/, "(same site)");
  } catch {
    return "";
  }
}
