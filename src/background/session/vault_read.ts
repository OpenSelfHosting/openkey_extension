/**
 * Decrypt local vault items and match by origin.
 */
import { decryptString } from "../../crypto/crypto";
import { listCollections, listEntries } from "../../db/store";
import { matchAndRankByUrls } from "../../shared/url_match";
import {
  resolveCaptureDecision,
  type CaptureDecision,
} from "../../shared/capture_decision";
import { nativeRequest, type NativeResponse } from "../../native/bridge";
import type {
  DecryptedCard,
  DecryptedCollection,
  DecryptedCrypto,
  DecryptedEntry,
  DecryptedSecret,
  VaultItem,
} from "../../shared/types";
import { fillUsername, isReservedCollection } from "../../shared/types";
import { normalizeFolderId } from "../../shared/vault_scope";
import {
  asCardFromNative,
  asCryptoFromNative,
  asLoginFromNative,
  asSecretFromNative,
  mapNativeCollections,
  matchSecretsForOrigin,
  nativeErrorMessage,
  isUnsupportedNativeType,
  parseVaultItem,
} from "./mapping";
import { isUnlocked } from "./auth";
import { getSession, vaultKeyFromSession } from "./state";

export { matchSecretsForOrigin };
export type { CaptureDecision };

const NATIVE_LIST_TIMEOUT_MS = 30_000;

export type VaultSnapshot = {
  entries: DecryptedEntry[];
  cards: DecryptedCard[];
  wallets: DecryptedCrypto[];
  secrets: DecryptedSecret[];
  collections: DecryptedCollection[];
  error?: string;
};

let snapshotInflight: Promise<VaultSnapshot> | null = null;
/** Null = unknown; false = desktop rejected listVault (older host). */
let nativeListVaultSupported: boolean | null = null;

function emptySnapshot(error?: string): VaultSnapshot {
  return {
    entries: [],
    cards: [],
    wallets: [],
    secrets: [],
    collections: [],
    error,
  };
}

function isNativeVaultPayload(
  res: NativeResponse,
): res is NativeResponse & {
  ok: true;
  entries: DecryptedEntry[];
  collections: DecryptedCollection[];
} {
  return res.ok === true && "entries" in res && "collections" in res;
}

function snapshotFromNativeLists(input: {
  entries?: DecryptedEntry[] | Record<string, unknown>[];
  cards?: DecryptedCard[] | Record<string, unknown>[];
  wallets?: DecryptedCrypto[] | Record<string, unknown>[];
  secrets?: Array<Record<string, unknown> | DecryptedSecret>;
  collections?: unknown;
  error?: string;
}): VaultSnapshot {
  return {
    entries: (input.entries ?? []).map((e) =>
      asLoginFromNative(e as DecryptedEntry | Record<string, unknown>),
    ),
    cards: (input.cards ?? []).map((c) =>
      asCardFromNative(c as DecryptedCard | Record<string, unknown>),
    ),
    wallets: (input.wallets ?? []).map((w) =>
      asCryptoFromNative(w as DecryptedCrypto | Record<string, unknown>),
    ),
    secrets: (input.secrets ?? []).map((s) =>
      asSecretFromNative(s as Record<string, unknown>),
    ),
    collections: mapNativeCollections(input.collections),
    error: input.error,
  };
}

async function loadStandaloneSnapshot(): Promise<VaultSnapshot> {
  const key = await vaultKeyFromSession();
  const rows = await listEntries();
  const items: VaultItem[] = [];
  for (const row of rows) {
    try {
      const json = decryptString(key, row.encryptedPayload);
      const payload = JSON.parse(json) as Record<string, unknown>;
      const item = parseVaultItem(row, payload);
      if (item) items.push(item);
    } catch {
      /* skip undecryptable */
    }
  }
  return {
    entries: items.filter((i): i is DecryptedEntry => i.kind === "login"),
    cards: items.filter((i): i is DecryptedCard => i.kind === "card"),
    wallets: items.filter((i): i is DecryptedCrypto => i.kind === "crypto"),
    secrets: items.filter((i): i is DecryptedSecret => i.kind === "secret"),
    collections: await listStandaloneCollections(key),
  };
}

async function listStandaloneCollections(
  key: Uint8Array,
): Promise<DecryptedCollection[]> {
  const rows = await listCollections();
  const out: DecryptedCollection[] = [];
  for (const row of rows) {
    if (row.isDeleted || isReservedCollection(row.uuid)) continue;
    let name = "Folder";
    try {
      name = decryptString(key, row.encryptedName) || name;
    } catch {
      /* keep placeholder */
    }
    out.push({
      uuid: row.uuid,
      name,
      icon: row.icon || "material:folder",
      color: row.color,
      parentUuid: normalizeFolderId(row.parentUuid),
      sortOrder: row.sortOrder,
    });
  }
  return out.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

async function loadNativeSnapshot(): Promise<VaultSnapshot> {
  if (nativeListVaultSupported !== false) {
    const combined = await nativeRequest(
      { type: "listVault" },
      NATIVE_LIST_TIMEOUT_MS,
    );
    if (isNativeVaultPayload(combined)) {
      nativeListVaultSupported = true;
      return snapshotFromNativeLists({
        entries: combined.entries,
        cards: "cards" in combined ? combined.cards : [],
        wallets: "wallets" in combined ? combined.wallets : [],
        secrets: "secrets" in combined ? combined.secrets : [],
        collections: combined.collections,
      });
    }
    if (combined.ok === false && isUnsupportedNativeType(combined.error)) {
      nativeListVaultSupported = false;
    } else if (!combined.ok) {
      return emptySnapshot(nativeErrorMessage(combined.error));
    }
  }

  const logins = await nativeRequest(
    { type: "listEntries" },
    NATIVE_LIST_TIMEOUT_MS,
  );
  const collections = await nativeRequest(
    { type: "listCollections" },
    NATIVE_LIST_TIMEOUT_MS,
  );
  const cards = await nativeRequest(
    { type: "listCards" },
    NATIVE_LIST_TIMEOUT_MS,
  );
  const crypto = await nativeRequest(
    { type: "listCrypto" },
    NATIVE_LIST_TIMEOUT_MS,
  );
  const secrets = await nativeRequest(
    { type: "listSecrets" },
    NATIVE_LIST_TIMEOUT_MS,
  );

  return snapshotFromNativeLists({
    entries: logins.ok && "entries" in logins ? logins.entries : [],
    cards: cards.ok && "cards" in cards ? cards.cards : [],
    wallets: crypto.ok && "wallets" in crypto ? crypto.wallets : [],
    secrets:
      secrets.ok && "secrets" in secrets
        ? secrets.secrets
        : [],
    collections:
      collections.ok && "collections" in collections
        ? collections.collections
        : [],
    error: !logins.ok ? nativeErrorMessage(logins.error) : undefined,
  });
}

/** Coalesce parallel popup/autofill list calls into one native round-trip. */
export async function listVaultSnapshot(): Promise<VaultSnapshot> {
  if (!(await isUnlocked())) return emptySnapshot();
  if (snapshotInflight) return snapshotInflight;
  snapshotInflight = (async () => {
    const session = await getSession();
    if (session.mode === "native") return loadNativeSnapshot();
    return loadStandaloneSnapshot();
  })().finally(() => {
    snapshotInflight = null;
  });
  return snapshotInflight;
}

export async function decryptLocalItems(): Promise<VaultItem[]> {
  const snap = await listVaultSnapshot();
  return [...snap.entries, ...snap.cards, ...snap.wallets, ...snap.secrets];
}

/** Login entries only — used by autofill and passkeys. */
export async function decryptLocalEntries(): Promise<DecryptedEntry[]> {
  return (await listVaultSnapshot()).entries;
}

export async function decryptLocalCards(): Promise<DecryptedCard[]> {
  return (await listVaultSnapshot()).cards;
}

export async function decryptLocalCrypto(): Promise<DecryptedCrypto[]> {
  return (await listVaultSnapshot()).wallets;
}

export async function decryptLocalSecrets(): Promise<DecryptedSecret[]> {
  return (await listVaultSnapshot()).secrets;
}

export async function listDecryptedCollections(): Promise<DecryptedCollection[]> {
  if (!(await isUnlocked())) return [];
  const session = await getSession();
  if (session.mode === "native") {
    if (snapshotInflight) return (await snapshotInflight).collections;
    const res = await nativeRequest(
      { type: "listCollections" },
      NATIVE_LIST_TIMEOUT_MS,
    );
    if (res.ok && "collections" in res) {
      return mapNativeCollections(res.collections);
    }
    return [];
  }
  const key = await vaultKeyFromSession();
  return listStandaloneCollections(key);
}

export async function secretsForOrigin(
  origin: string,
): Promise<DecryptedSecret[]> {
  if (!(await isUnlocked())) return [];
  const all = await decryptLocalSecrets();
  return matchSecretsForOrigin(all, origin);
}

export function matchEntriesForOrigin(
  entries: DecryptedEntry[],
  origin: string,
): DecryptedEntry[] {
  return matchAndRankByUrls(entries, origin);
}

export async function entriesForOrigin(
  origin: string,
): Promise<DecryptedEntry[]> {
  const session = await getSession();
  if (session.mode === "native") {
    const res = await nativeRequest(
      { type: "listForOrigin", origin },
      NATIVE_LIST_TIMEOUT_MS,
    );
    if (res.ok && "entries" in res) {
      return res.entries.map((e) => asLoginFromNative(e));
    }
  }
  if (!(await isUnlocked())) return [];
  const all = await decryptLocalEntries();
  return matchEntriesForOrigin(all, origin);
}

export async function decideCapture(input: {
  username: string;
  password: string;
  url: string;
}): Promise<CaptureDecision> {
  const unlocked = await isUnlocked();
  const matches = unlocked
    ? (await entriesForOrigin(input.url)).map((e) => ({
        uuid: e.uuid,
        title: e.title,
        username: fillUsername(e),
        password: e.password,
      }))
    : [];
  return resolveCaptureDecision(input, { unlocked, matches });
}
