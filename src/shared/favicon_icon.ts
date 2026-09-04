/**
 * Resolve a persistable login icon (brand SVG key or fetched favicon PNG).
 * Used when the extension creates a login so the vault stores the same
 * icon the OpenKey app would suggest.
 */

import type { EntryIconFields } from "./entry_icon";
import {
  bytesToBase64,
  encodeFaviconPngKey,
  faviconCandidateUrls,
  isPngMagic,
  persistableBrandIcon,
  shouldReplaceStoredIcon,
} from "./save_icon";

export type ResolveLoginIconInput = EntryIconFields & {
  pageUrl?: string;
  pageIconUrl?: string;
  existingIcon?: string;
};

export type ResolveLoginIconDeps = {
  fetch?: typeof fetch;
  toPng?: (bytes: Uint8Array) => Promise<Uint8Array | null>;
  timeoutMs?: number;
};

const FETCH_TIMEOUT_MS = 3500;
const MAX_BYTES = 180_000;
const MAX_KEY_CHARS = 180_000;

async function defaultToPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (isPngMagic(bytes) && bytes.byteLength <= 48_000) return bytes;
  try {
    if (typeof createImageBitmap !== "function") {
      return isPngMagic(bytes) ? bytes : null;
    }
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    const blob = new Blob([copy]);
    const bitmap = await createImageBitmap(blob);
    const edge = Math.min(64, Math.max(bitmap.width, bitmap.height, 16));
    if (typeof OffscreenCanvas !== "function") {
      bitmap.close?.();
      return isPngMagic(bytes) ? bytes : null;
    }
    const canvas = new OffscreenCanvas(edge, edge);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return isPngMagic(bytes) ? bytes : null;
    }
    ctx.drawImage(bitmap, 0, 0, edge, edge);
    bitmap.close?.();
    const out = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await out.arrayBuffer());
  } catch {
    return isPngMagic(bytes) ? bytes : null;
  }
}

async function fetchFaviconIconKey(
  input: ResolveLoginIconInput,
  deps: ResolveLoginIconDeps = {},
): Promise<string | null> {
  const doFetch = deps.fetch ?? fetch;
  const toPng = deps.toPng ?? defaultToPng;
  const timeoutMs = deps.timeoutMs ?? FETCH_TIMEOUT_MS;
  const candidates = faviconCandidateUrls({
    urls: input.urls,
    pageUrl: input.pageUrl,
    pageIconUrl: input.pageIconUrl,
  });

  for (const url of candidates) {
    try {
      const signal =
        typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
          ? AbortSignal.timeout(timeoutMs)
          : undefined;
      const res = await doFetch(url, {
        redirect: "follow",
        ...(signal ? { signal } : {}),
      });
      if (!res.ok) continue;
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (
        type &&
        !type.startsWith("image/") &&
        !type.includes("icon") &&
        !type.includes("octet-stream")
      ) {
        continue;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength < 16 || buf.byteLength > MAX_BYTES) continue;
      const png = await toPng(buf);
      if (!png || png.byteLength < 16) continue;
      const key = encodeFaviconPngKey(bytesToBase64(png));
      if (key.length > MAX_KEY_CHARS) continue;
      return key;
    } catch {
      continue;
    }
  }
  return null;
}

/** Brand first (no network), then favicon. Never throws. */
export async function resolveIconForLogin(
  input: ResolveLoginIconInput,
  deps?: ResolveLoginIconDeps,
): Promise<string | undefined> {
  if (!shouldReplaceStoredIcon(input.existingIcon)) {
    return input.existingIcon!.trim();
  }
  const brand = persistableBrandIcon(input);
  if (brand) return brand;
  try {
    const favicon = await fetchFaviconIconKey(input, deps);
    if (favicon) return favicon;
  } catch {
    /* keep generic */
  }
  const existing = input.existingIcon?.trim();
  return existing || undefined;
}
