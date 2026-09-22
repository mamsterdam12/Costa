// Minimal robots.txt support: enough to honour an explicit Disallow and
// a Crawl-delay, which is the part that actually matters for a polite
// crawler. Anything we can't fetch or parse is treated as "allowed",
// which is the conventional reading of a missing robots.txt.

export type RobotsRules = {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number | null;
};

export const EMPTY_ROBOTS: RobotsRules = { disallow: [], allow: [], crawlDelayMs: null };

// Picks the group that applies to us: an exact user-agent match wins over
// the "*" group, per the standard.
export function parseRobots(text: string, userAgentToken: string): RobotsRules {
  const groups = new Map<string, string[]>();
  let current: string[] = [];
  let agents: string[] = [];
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const key = field.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      if (!lastWasAgent) {
        agents = [];
        current = [];
      }
      agents.push(value.toLowerCase());
      for (const a of agents) groups.set(a, current);
      lastWasAgent = true;
    } else if (agents.length) {
      current.push(`${key}:${value}`);
      lastWasAgent = false;
    }
  }

  const lines = groups.get(userAgentToken.toLowerCase()) ?? groups.get("*") ?? [];
  const rules: RobotsRules = { disallow: [], allow: [], crawlDelayMs: null };
  for (const line of lines) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (key === "disallow" && value) rules.disallow.push(value);
    else if (key === "allow" && value) rules.allow.push(value);
    else if (key === "crawl-delay") {
      const seconds = Number(value);
      if (!isNaN(seconds) && seconds > 0) rules.crawlDelayMs = Math.min(seconds, 60) * 1000;
    }
  }
  return rules;
}

// Longest matching rule wins; Allow beats Disallow at equal length.
export function isAllowed(rules: RobotsRules, pathname: string): boolean {
  const match = (patterns: string[]) =>
    patterns.reduce((best, p) => (pathname.startsWith(p) && p.length > best ? p.length : best), 0);
  const blocked = match(rules.disallow);
  if (blocked === 0) return true;
  return match(rules.allow) >= blocked;
}
