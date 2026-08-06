/**
 * Smarter URI matching for autofill.
 *
 * Different ports on the same hostname are treated as different sites
 * (e.g. host:5678 must not fill host:8444).
 */

export type UrlMatchScore =
  | 0 // no match
  | 1 // related hostname, same effective port (subdomain)
  | 2 // exact hostname + port
  | 3 // same origin (scheme + host + port)
  | 4; // exact / prefix URL match

function parseLoose(raw: string): URL | null {
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

/** Default port when omitted from the URL. */
export function effectivePort(url: URL): number {
  if (url.port) return Number(url.port);
  if (url.protocol === "http:") return 80;
  if (url.protocol === "https:") return 443;
  return 0;
}

/** `hostname:port` key used for authority equality. */
export function authorityKey(url: URL): string {
  return `${url.hostname.toLowerCase()}:${effectivePort(url)}`;
}

function stripWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function hostnamesRelated(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right || stripWww(left) === stripWww(right)) return true;
  return left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

/**
 * Score how well `candidate` matches the page URL/href.
 * Returns 0 when ports differ (even if hostnames match).
 */
export function scoreUrlMatch(candidate: string, pageHref: string): UrlMatchScore {
  const page = parseLoose(pageHref);
  const entry = parseLoose(candidate);
  if (!page || !entry) return 0;

  // Different effective ports → never match (the bug the user hit).
  if (effectivePort(page) !== effectivePort(entry)) return 0;

  if (!hostnamesRelated(page.hostname, entry.hostname)) return 0;

  const pageNorm = page.href.replace(/\/$/, "");
  const entryNorm = entry.href.replace(/\/$/, "");
  if (
    candidate === pageHref ||
    entry.href === page.href ||
    pageNorm === entryNorm ||
    page.href.startsWith(entry.href) ||
    entry.href.startsWith(page.origin + "/")
  ) {
    // Prefer tighter URL overlap.
    if (page.origin === entry.origin) {
      if (pageNorm === entryNorm || page.pathname === entry.pathname) return 4;
      return 3;
    }
  }

  const pageHost = page.hostname.toLowerCase();
  const entryHost = entry.hostname.toLowerCase();
  if (pageHost === entryHost || stripWww(pageHost) === stripWww(entryHost)) {
    return 2;
  }
  return 1;
}

/** Best score across an entry's URL list. */
export function bestEntryScore(
  urls: string[],
  pageHref: string,
): UrlMatchScore {
  let best: UrlMatchScore = 0;
  for (const u of urls) {
    const s = scoreUrlMatch(u, pageHref);
    if (s > best) best = s;
  }
  return best;
}

export type Scored<T> = { item: T; score: UrlMatchScore };

/** Filter + rank items that expose a `urls` list. */
export function matchAndRankByUrls<T extends { urls: string[] }>(
  items: T[],
  pageHref: string,
): T[] {
  const scored: Scored<T>[] = [];
  for (const item of items) {
    const score = bestEntryScore(item.urls ?? [], pageHref);
    if (score > 0) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
