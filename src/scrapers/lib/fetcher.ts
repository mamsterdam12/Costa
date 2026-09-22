import { prisma } from "../../lib/prisma";
import { USER_AGENT, USER_AGENT_TOKEN, detectChallenge, metaRefreshTarget, rawFetch } from "./http";
import { EMPTY_ROBOTS, isAllowed, parseRobots, type RobotsRules } from "./robots";

// The single way every scraper reaches the network. It exists because
// fetching is where all the obstacles are: bot challenges, rate limits,
// redirects that aren't HTTP redirects, and our own habit of re-reading
// the same page. Everything here is about touching the origin as rarely
// as possible and never losing what we already have.

const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000; // reuse a stored copy this fresh without asking
const DEFAULT_STALE_FALLBACK_MS = 7 * 24 * 60 * 60 * 1000; // ...and this old if we're refused
const MIN_HOST_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 2;

export type PageResult = {
  requestedUrl: string;
  url: string;
  html: string;
  status: number;
  contentType: string;
  /** Served from PageSnapshot rather than the network. */
  fromCache: boolean;
  fetchedAt: Date;
  ageMs: number;
  /** Set when the live fetch failed and we fell back to a stored copy. */
  degraded?: string;
  notes: string[];
};

export class FetchRefused extends Error {
  constructor(
    message: string,
    readonly reason: "blocked" | "robots" | "error",
    readonly detail: string
  ) {
    super(message);
  }
}

const lastHostRequest = new Map<string, number>();
const robotsCache = new Map<string, { rules: RobotsRules; at: number }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForHost(host: string, crawlDelayMs: number | null) {
  const interval = Math.max(crawlDelayMs ?? 0, MIN_HOST_INTERVAL_MS);
  const last = lastHostRequest.get(host);
  const wait = last ? last + interval - Date.now() : 0;
  if (wait > 0) await sleep(wait);
  lastHostRequest.set(host, Date.now());
}

async function getRobots(origin: string, notes: string[]): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.at < 24 * 60 * 60 * 1000) return cached.rules;

  let rules = EMPTY_ROBOTS;
  try {
    await waitForHost(new URL(origin).host, null);
    const res = await rawFetch(`${origin}/robots.txt`, 8000);
    // A challenge or an error page is not a robots.txt; don't read rules
    // out of it, and don't let it stop us either.
    if (res.status === 200 && !detectChallenge(res.html, res.url) && res.html.length < 500_000) {
      rules = parseRobots(res.html, USER_AGENT_TOKEN);
      if (rules.disallow.length || rules.crawlDelayMs) {
        notes.push(
          `robots.txt: ${rules.disallow.length} disallow rule(s)` +
            (rules.crawlDelayMs ? `, crawl-delay ${rules.crawlDelayMs / 1000}s` : "")
        );
      }
    }
  } catch {
    // Unreachable robots.txt conventionally means "crawling allowed".
  }
  robotsCache.set(origin, { rules, at: Date.now() });
  return rules;
}

function toResult(
  requestedUrl: string,
  snap: { finalUrl: string; body: string; status: number; contentType: string; fetchedAt: Date },
  fromCache: boolean,
  notes: string[],
  degraded?: string
): PageResult {
  return {
    requestedUrl,
    url: snap.finalUrl,
    html: snap.body,
    status: snap.status,
    contentType: snap.contentType,
    fromCache,
    fetchedAt: snap.fetchedAt,
    ageMs: Date.now() - snap.fetchedAt.getTime(),
    degraded,
    notes,
  };
}

export type FetchPageOptions = {
  /** Reuse a stored copy younger than this without touching the network. */
  maxAgeMs?: number;
  /** Go to the network even if the stored copy is fresh. */
  force?: boolean;
  /** How old a stored copy may be and still stand in when we're refused. */
  staleFallbackMs?: number;
};

export async function fetchPage(url: string, options: FetchPageOptions = {}): Promise<PageResult> {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const staleFallbackMs = options.staleFallbackMs ?? DEFAULT_STALE_FALLBACK_MS;
  const notes: string[] = [];
  const target = new URL(url);

  const snapshot = await prisma.pageSnapshot.findUnique({ where: { url } });

  if (snapshot && !options.force && Date.now() - snapshot.fetchedAt.getTime() < maxAgeMs) {
    notes.push(`cache hit (${Math.round((Date.now() - snapshot.fetchedAt.getTime()) / 1000)}s old)`);
    return toResult(url, snapshot, true, notes);
  }

  const fallback = (reason: string, detail: string): PageResult => {
    if (snapshot && Date.now() - snapshot.fetchedAt.getTime() < staleFallbackMs) {
      const hours = Math.round((Date.now() - snapshot.fetchedAt.getTime()) / 3_600_000);
      notes.push(`live fetch refused (${detail}); using stored copy from ${hours}h ago`);
      return toResult(url, snapshot, true, notes, detail);
    }
    throw new FetchRefused(`${reason}: ${detail}`, reason === "robots" ? "robots" : "blocked", detail);
  };

  const robots = await getRobots(target.origin, notes);
  if (!isAllowed(robots, target.pathname)) {
    // Not something to fall back around: the site said don't.
    throw new FetchRefused(`robots.txt disallows ${target.pathname}`, "robots", "robots.txt");
  }

  let lastDetail = "unknown";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await waitForHost(target.host, robots.crawlDelayMs);
      let res = await rawFetch(url, 15000, {
        // Let the origin answer "unchanged" and skip sending the body.
        ...(snapshot?.etag ? { "if-none-match": snapshot.etag } : {}),
        ...(snapshot?.lastModified ? { "if-modified-since": snapshot.lastModified } : {}),
      });

      if (res.status === 304 && snapshot) {
        notes.push("origin says unchanged (304)");
        const touched = await prisma.pageSnapshot.update({
          where: { url },
          data: { fetchedAt: new Date(), lastAttemptAt: new Date(), lastError: null },
        });
        return toResult(url, touched, false, notes);
      }

      // meta-refresh is not an HTTP redirect, so fetch won't follow it.
      let hops = 0;
      let challenge = detectChallenge(res.html, res.url);
      while (!challenge && hops < 3) {
        const next = metaRefreshTarget(res.html, res.url);
        if (!next || next === res.url) break;
        challenge = detectChallenge("", next);
        if (challenge) break; // a CAPTCHA is a "no", not a redirect to follow
        await waitForHost(new URL(next).host, robots.crawlDelayMs);
        res = await rawFetch(next, 15000);
        hops++;
        challenge = detectChallenge(res.html, res.url);
      }

      if (challenge) {
        lastDetail = challenge;
        await prisma.pageSnapshot.updateMany({
          where: { url },
          data: { lastAttemptAt: new Date(), lastError: challenge, blockedAt: new Date() },
        });
        if (attempt < MAX_ATTEMPTS) {
          await sleep(2000);
          continue;
        }
        return fallback("blocked", challenge);
      }

      const stored = {
        finalUrl: res.url,
        status: res.status,
        contentType: res.contentType,
        body: res.html,
        bytes: res.html.length,
        etag: res.etag ?? null,
        lastModified: res.lastModified ?? null,
        fetchedAt: new Date(),
        lastAttemptAt: new Date(),
        lastError: null,
      };
      const saved = await prisma.pageSnapshot.upsert({
        where: { url },
        update: stored,
        create: { url, ...stored },
      });
      notes.push(`fetched ${res.html.length} chars`);
      return toResult(url, saved, false, notes);
    } catch (err) {
      if (err instanceof FetchRefused) throw err;
      lastDetail = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(2000);
        continue;
      }
    }
  }

  await prisma.pageSnapshot.updateMany({
    where: { url },
    data: { lastAttemptAt: new Date(), lastError: lastDetail },
  });
  return fallback("error", lastDetail);
}
