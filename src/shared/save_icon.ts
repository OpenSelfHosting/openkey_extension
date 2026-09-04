/**
 * Icon keys persisted on a login — same strings as OpenKey_app EntryIcons.
 * Brand SVGs are stored as `brands/foo.svg`; site artwork as
 * `custom:favicon:png:<base64>`.
 */

import {
  isGenericMaterialIcon,
  suggestBrandKey,
  type EntryIconFields,
} from "./entry_icon";

export const FAVICON_KEY_PREFIX = "custom:favicon:png:";

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

export function encodeFaviconPngKey(pngBase64: string): string {
  return `${FAVICON_KEY_PREFIX}${pngBase64}`;
}

export function isPngMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Brand catalog key to store, or null when the site is not in the catalog. */
export function persistableBrandIcon(fields: EntryIconFields): string | null {
  return suggestBrandKey(fields);
}

/**
 * Fetch order matches OpenKey_app FaviconFetcher: page icon, /favicon.png,
 * Google s2 PNG, then /favicon.ico.
 */
export function faviconCandidateUrls(input: {
  urls?: string[];
  pageUrl?: string;
  pageIconUrl?: string;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (url: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };

  if (input.pageIconUrl?.trim()) push(input.pageIconUrl.trim());

  const hosts: string[] = [];
  const addHost = (raw?: string) => {
    const host = raw ? hostnameOf(raw) : null;
    if (!host || host === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      return;
    }
    if (!hosts.includes(host)) hosts.push(host);
  };
  addHost(input.pageUrl);
  for (const url of input.urls ?? []) addHost(url);

  for (const host of hosts) {
    push(`https://${host}/favicon.png`);
    const domain = host.startsWith("www.") ? host.slice(4) : host;
    push(
      `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`,
    );
    push(`https://${host}/favicon.ico`);
  }
  return out;
}

export function shouldReplaceStoredIcon(existing?: string): boolean {
  return isGenericMaterialIcon(existing);
}
