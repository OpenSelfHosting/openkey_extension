/**
 * Vault entry icon keys — same formats as OpenKey_app EntryIcons:
 * - `material:<name>` (or a bare Material name like `folder`)
 * - `brands/<file.svg>` / legacy `brand:github`
 * - `custom:png:<base64>` / `custom:favicon:png:<base64>`
 * - empty — suggest a brand from title / URL / username
 */

import brandIconsList from "./brands_icons_list.json";

export type EntryIconFields = {
  icon?: string;
  title?: string;
  urls?: string[];
  username?: string;
  /** Current page URL — used for in-page autofill brand / favicon hints. */
  pageUrl?: string;
};

export type ResolvedEntryIcon =
  | { kind: "image"; src: string }
  | { kind: "glyph"; path: string; name: string };

export const MATERIAL_KEY_PATH =
  "M12.65 10A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z";

const MATERIAL_LOCK_PATH =
  "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10z";

const MATERIAL_FOLDER_PATH =
  "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z";

const MATERIAL_CARD_PATH =
  "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z";

const MATERIAL_PERSON_PATH =
  "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z";

const MATERIAL_LANGUAGE_PATH =
  "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.987 7.987 0 0 1 5.08 16zm2.95-8H5.08a7.987 7.987 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z";

const MATERIAL_NOTES_PATH =
  "M3 18h12v-2H3v2zM3 6v2h18V6H3zm0 7h18v-2H3v2z";

const MATERIAL_GROUPS_PATH =
  "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z";

const MATERIAL_SHARE_PATH =
  "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z";

const MATERIAL_CLOUD_PATH =
  "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z";

const MATERIAL_TERMINAL_PATH =
  "M20 4H4c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.11-.9-2-2-2zm0 14H4V8h16v10zm-2-1h-6v-2h6v2zM7.5 17l-1.41-1.41L8.67 13l-2.59-2.59L7.5 9l4 4-4 4z";

const MATERIAL_PASSWORD_PATH =
  "M2 17h20v2H2v-2zm1.15-4.05L4 11.47l.85 1.48 1.3-.75-.85-1.48H7v-1.5H5.3l.85-1.47L4.85 7 4 8.47 3.15 7l-1.3.75.85 1.47H1v1.5h1.7l-.85 1.48 1.3.75zm6.7-.75l1.3.75.85-1.48H14v-1.5h-1.7l.85-1.47L11.85 7 11 8.47 10.15 7l-1.3.75.85 1.47H8v1.5h1.7l-.85 1.48 1.3.75zM23 9.22h-1.7l.85-1.47L20.85 7 20 8.47 19.15 7l-1.3.75.85 1.47H17v1.5h1.7l-.85 1.48 1.3.75.85-1.48.85 1.48 1.3-.75-.85-1.48H23v-1.5z";

const MATERIAL_BITCOIN_PATH =
  "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V5h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z";

const MATERIAL_EMAIL_PATH =
  "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z";

const MATERIAL_WORK_PATH =
  "M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z";

const MATERIAL_HOME_PATH =
  "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z";

const MATERIAL_STAR_PATH =
  "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

const MATERIAL_SETTINGS_PATH =
  "M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z";

/** Material glyph name → SVG path. Unknown names fall back to `key`. */
export const MATERIAL_PATHS: Record<string, string> = {
  key: MATERIAL_KEY_PATH,
  vpn_key: MATERIAL_KEY_PATH,
  login: MATERIAL_KEY_PATH,
  lock: MATERIAL_LOCK_PATH,
  security: MATERIAL_LOCK_PATH,
  folder: MATERIAL_FOLDER_PATH,
  credit_card: MATERIAL_CARD_PATH,
  person: MATERIAL_PERSON_PATH,
  manage_accounts: MATERIAL_PERSON_PATH,
  language: MATERIAL_LANGUAGE_PATH,
  notes: MATERIAL_NOTES_PATH,
  sticky_note_2: MATERIAL_NOTES_PATH,
  description: MATERIAL_NOTES_PATH,
  groups: MATERIAL_GROUPS_PATH,
  share: MATERIAL_SHARE_PATH,
  cloud: MATERIAL_CLOUD_PATH,
  terminal: MATERIAL_TERMINAL_PATH,
  password: MATERIAL_PASSWORD_PATH,
  currency_bitcoin: MATERIAL_BITCOIN_PATH,
  email: MATERIAL_EMAIL_PATH,
  mail: MATERIAL_EMAIL_PATH,
  work: MATERIAL_WORK_PATH,
  home: MATERIAL_HOME_PATH,
  star: MATERIAL_STAR_PATH,
  favorite: MATERIAL_STAR_PATH,
  settings: MATERIAL_SETTINGS_PATH,
  admin_panel_settings: MATERIAL_SETTINGS_PATH,
};

const MATERIAL_ALIASES: Record<string, string> = {
  games: "sports_esports",
  music: "music_note",
  health: "health_and_safety",
  wallet: "account_balance_wallet",
};

/** Old Font Awesome `brand:*` keys → Simple Icons filenames (app EntryIcons.legacyBrandSvg). */
export const LEGACY_BRAND_SVG: Record<string, string> = {
  "brand:google": "google.svg",
  "brand:github": "github.svg",
  "brand:apple": "apple.svg",
  "brand:microsoft": "microsoft.svg",
  "brand:amazon": "amazon.svg",
  "brand:facebook": "facebook.svg",
  "brand:xTwitter": "x.svg",
  "brand:instagram": "instagram.svg",
  "brand:linkedin": "linkedin.svg",
  "brand:discord": "discord.svg",
  "brand:slack": "slack.svg",
  "brand:spotify": "spotify.svg",
  "brand:paypal": "paypal.svg",
  "brand:stripe": "stripe.svg",
  "brand:aws": "aws.svg",
  "brand:docker": "docker.svg",
  "brand:reddit": "reddit.svg",
  "brand:telegram": "telegram.svg",
  "brand:youtube": "youtube.svg",
  "brand:dropbox": "dropbox.svg",
};

const TLDISH = new Set([
  "com",
  "org",
  "net",
  "io",
  "co",
  "app",
  "dev",
  "me",
  "ai",
  "gov",
  "edu",
  "uk",
  "us",
  "de",
  "fr",
  "jp",
  "cn",
  "ru",
  "br",
  "in",
  "au",
  "ca",
  "info",
  "biz",
]);

type BrandIconInfo = { name: string; path: string };

const BRANDS = brandIconsList as BrandIconInfo[];

export type ResolveIconOptions = {
  /** Maps `brands/foo.svg` → a URL the UI can load. */
  assetUrl?: (path: string) => string;
  /** When the stored key is empty and no brand matches. */
  fallback?: "key" | "folder";
  /**
   * In-page autofill: if the stored icon is a generic key, still try a brand
   * SVG or the site favicon (Chrome-style dataset icons).
   */
  preferSiteArtwork?: boolean;
  /** Favicon already on the page (`link[rel=icon]`). */
  pageIconUrl?: string;
};

/** `chrome-extension://…` URL, or the path when not running in an extension. */
export function runtimeAssetUrl(path: string): string {
  try {
    const chromeRt = typeof chrome !== "undefined" ? chrome.runtime : undefined;
    if (chromeRt?.getURL) return chromeRt.getURL(path);
  } catch {
    /* ignore */
  }
  try {
    const browserRt =
      typeof browser !== "undefined" ? browser.runtime : undefined;
    if (browserRt?.getURL) return browserRt.getURL(path);
  } catch {
    /* ignore */
  }
  return path;
}

function defaultAssetUrl(path: string): string {
  return runtimeAssetUrl(path);
}

export function escapeIconAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isCustomIconKey(key: string): boolean {
  return key.startsWith("custom:");
}

export function isBrandIconKey(key: string): boolean {
  return key.startsWith("brands/") || key.startsWith("brand:");
}

const GENERIC_MATERIAL = new Set(["key", "vpn_key", "login", "password"]);

/** Default vault key / empty — not a user-chosen brand or custom image. */
export function isGenericMaterialIcon(key: string | undefined): boolean {
  const trimmed = key?.trim() ?? "";
  if (!trimmed) return true;
  if (isCustomIconKey(trimmed) || isBrandIconKey(trimmed)) return false;
  return GENERIC_MATERIAL.has(materialNameOf(trimmed));
}

export function needsIconBackdrop(key: string): boolean {
  if (!key) return true;
  if (isCustomIconKey(key) || isBrandIconKey(key)) return false;
  return true;
}

/** Safe `file.svg` from a stored brand key, or null. */
export function brandFileName(key: string): string | null {
  let file: string | null = null;
  if (key.startsWith("brands/")) {
    file = key.slice("brands/".length);
  } else if (key.startsWith("brand:")) {
    file = LEGACY_BRAND_SVG[key] ?? null;
  }
  if (!file || file.includes("/") || file.includes("\\") || file.includes("..")) {
    return null;
  }
  if (!/^[a-zA-Z0-9._-]+\.svg$/i.test(file)) return null;
  return file;
}

export function customIconDataUrl(key: string): string | null {
  if (!key.startsWith("custom:")) return null;
  const favicon = "custom:favicon:";
  let rest = key.startsWith(favicon)
    ? key.slice(favicon.length)
    : key.slice("custom:".length);
  if (rest.startsWith("data:image/")) return rest;
  if (rest.startsWith("png:")) rest = rest.slice(4);
  if (!rest) return null;
  return `data:image/png;base64,${rest}`;
}

export function materialNameOf(key: string): string {
  let name = key.startsWith("material:") ? key.slice("material:".length) : key;
  if (name.endsWith("_rounded")) name = name.slice(0, -"_rounded".length);
  return MATERIAL_ALIASES[name] ?? name;
}

export function materialPathOf(name: string): string {
  return MATERIAL_PATHS[name] ?? MATERIAL_KEY_PATH;
}

function glyph(name: string): ResolvedEntryIcon {
  const n = materialNameOf(name);
  return { kind: "glyph", name: n, path: materialPathOf(n) };
}

function resolveStoredKey(
  key: string,
  assetUrl: (path: string) => string,
): ResolvedEntryIcon {
  const trimmed = key.trim();
  const custom = customIconDataUrl(trimmed);
  if (custom) return { kind: "image", src: custom };

  const brand = brandFileName(trimmed);
  if (brand) return { kind: "image", src: assetUrl(`brands/${brand}`) };

  if (
    trimmed.startsWith("material:") ||
    (!trimmed.includes("/") && !trimmed.includes(":"))
  ) {
    return glyph(trimmed);
  }
  return glyph("key");
}

function compactAlnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hostnameOf(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const withScheme = text.includes("://") ? text : `https://${text}`;
    const host = new URL(withScheme).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function extractHost(raw: string): string | null {
  const host = hostnameOf(raw);
  if (!host) return null;
  return host.startsWith("www.") ? host.slice(4) : host;
}

/** First usable site artwork URL (Google s2 PNG — `/favicon.ico` often 404s). */
export function siteFaviconUrl(
  urls?: string[],
  pageUrl?: string,
): string | undefined {
  const candidates = [pageUrl, ...(urls ?? [])];
  for (const raw of candidates) {
    if (!raw?.trim()) continue;
    const host = hostnameOf(raw);
    if (!host || host === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      continue;
    }
    const domain = host.startsWith("www.") ? host.slice(4) : host;
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
  }
  return undefined;
}

function hostTokens(url: string): string[] {
  const host = extractHost(url);
  if (!host) return [];
  const parts = host.split(".").filter((p) => p && !TLDISH.has(p));
  if (!parts.length) return [];
  const primary = parts[parts.length - 1]!;
  const out = new Set<string>([primary, host.replace(/\./g, "")]);
  if (parts.length >= 2) {
    out.add(parts.slice(-2).join(""));
  }
  return [...out];
}

function titleTokens(title: string): string[] {
  const trimmed = title.trim();
  if (!trimmed) return [];
  const compact = compactAlnum(trimmed);
  const words = trimmed
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  return [...new Set([compact, ...words].filter(Boolean))];
}

function emailDomainTokens(username: string): string[] {
  const at = username.indexOf("@");
  if (at < 0 || at === username.length - 1) return [];
  return hostTokens(`https://${username.slice(at + 1)}`);
}

function tokenTiers(fields: EntryIconFields): string[][] {
  const urlQueries: string[] = [];
  for (const url of fields.urls ?? []) {
    urlQueries.push(...hostTokens(url));
  }
  if (fields.pageUrl) urlQueries.push(...hostTokens(fields.pageUrl));
  return [
    [...urlQueries, ...titleTokens(fields.title ?? "")],
    [...emailDomainTokens(fields.username ?? "")],
  ];
}

function scoreBrand(brand: BrandIconInfo, query: string): number {
  if (!query) return 0;
  const slug = brand.path.replace(/\.svg$/i, "").toLowerCase();
  const name = compactAlnum(brand.name);
  const q = compactAlnum(query);
  if (!q) return 0;
  if (slug === q || name === q) return 100;
  if (slug.startsWith(`${q}-`) || slug.endsWith(`-${q}`)) return 92;
  if (slug.includes(q) && q.length >= 3) return 85;
  if (name.includes(q) && q.length >= 3) return 82;
  if (q.includes(slug) && slug.length >= 4) return 80;
  if (q.includes(name) && name.length >= 4) return 78;
  return 0;
}

function bestBrandMatch(queries: string[]): string | null {
  if (!queries.length) return null;
  let best: BrandIconInfo | null = null;
  let bestScore = 0;
  for (const brand of BRANDS) {
    for (const query of queries) {
      const s = scoreBrand(brand, query);
      if (s > bestScore) {
        bestScore = s;
        best = brand;
      }
    }
  }
  if (best && bestScore >= 80) return `brands/${best.path}`;
  return null;
}

/** Brand key from title / URL / username, or null. */
export function suggestBrandKey(fields: EntryIconFields): string | null {
  for (const queries of tokenTiers(fields)) {
    const key = bestBrandMatch(queries);
    if (key) return key;
  }
  return null;
}

export function resolveEntryIcon(
  fields: EntryIconFields,
  opts?: ResolveIconOptions,
): ResolvedEntryIcon {
  const assetUrl = opts?.assetUrl ?? defaultAssetUrl;
  const stored = fields.icon?.trim() ?? "";
  const skipStored =
    !stored || (opts?.preferSiteArtwork === true && isGenericMaterialIcon(stored));

  if (stored && !skipStored) return resolveStoredKey(stored, assetUrl);

  const suggested = suggestBrandKey(fields);
  if (suggested) return resolveStoredKey(suggested, assetUrl);

  const favicon =
    opts?.pageIconUrl?.trim() || siteFaviconUrl(fields.urls, fields.pageUrl);
  if (favicon) return { kind: "image", src: favicon };

  if (stored) return resolveStoredKey(stored, assetUrl);
  return glyph(opts?.fallback ?? "key");
}

export function materialSvgHtml(name: string, size = 20): string {
  const d = materialPathOf(materialNameOf(name));
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
}

export function entryIconHtml(
  fields: EntryIconFields,
  opts?: ResolveIconOptions & {
    className?: string;
    size?: number;
  },
): string {
  const resolved = resolveEntryIcon(fields, opts);
  const base = opts?.className ?? "item-icon";
  if (resolved.kind === "image") {
    const cls = base
      .split(/\s+/)
      .filter(
        (c) => c && c !== "primary" && c !== "cookie" && c !== "tertiary",
      )
      .concat("entry-icon-media")
      .join(" ");
    return `<div class="${cls}" data-icon-fallback="${escapeIconAttr(opts?.fallback ?? "key")}"><img alt="" referrerpolicy="no-referrer" src="${escapeIconAttr(resolved.src)}"></div>`;
  }
  return `<div class="${base}">${materialSvgHtml(resolved.name, opts?.size ?? 20)}</div>`;
}

/**
 * MV3 CSP blocks inline `onerror=` handlers. Wire failed `<img>` loads
 * to the Material key/folder glyph after innerHTML insert.
 */
export function wireEntryIconImages(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>(".entry-icon-media img").forEach((img) => {
    if (img.dataset.openkeyIconWired === "1") return;
    img.dataset.openkeyIconWired = "1";
    img.addEventListener("error", () => {
      const wrap = img.closest(".entry-icon-media");
      if (!(wrap instanceof HTMLElement)) return;
      const fallback = wrap.getAttribute("data-icon-fallback") || "key";
      wrap.classList.remove("entry-icon-media");
      wrap.innerHTML = materialSvgHtml(fallback, wrap.classList.contains("detail-avatar") ? 44 : 20);
    });
  });
}

export type PickerVisual = {
  imageSrc?: string;
  glyphPath?: string;
  /** True for Material glyphs (tinted plate); false for brand / custom images. */
  backdrop: boolean;
};

export function pickerVisual(
  fields: EntryIconFields,
  opts?: ResolveIconOptions,
): PickerVisual {
  const resolved = resolveEntryIcon(fields, opts);
  if (resolved.kind === "image") {
    return { imageSrc: resolved.src, backdrop: false };
  }
  return { glyphPath: resolved.path, backdrop: true };
}
