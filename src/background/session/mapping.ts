/**
 * Pure vault item mapping / origin-match helpers used by session flows.
 * No I/O, crypto, or chrome APIs — safe to unit-test in isolation.
 */
import type {
  CardPayload,
  CryptoPayload,
  DecryptedCard,
  DecryptedCollection,
  DecryptedCrypto,
  DecryptedEntry,
  DecryptedSecret,
  EntryPayload,
  SecretPayload,
  VaultItem,
} from "../../shared/types";
import {
  ReservedCollections,
  isReservedCollection,
  normalizeSecretKind,
} from "../../shared/types";
import { normalizeFolderId } from "../../shared/vault_scope";

export type VaultRowMeta = {
  uuid: string;
  collectionUuid: string | null;
  revision: number;
};

export function normalizeLogin(
  row: VaultRowMeta,
  payload: EntryPayload,
): DecryptedEntry {
  return {
    kind: "login",
    uuid: row.uuid,
    collectionUuid: normalizeFolderId(row.collectionUuid),
    revision: row.revision,
    title: payload.title ?? "",
    username: payload.username ?? "",
    password: payload.password ?? "",
    urls: payload.urls ?? [],
    notes: payload.notes ?? "",
    tags: payload.tags ?? [],
    fields: payload.fields ?? [],
    fieldOrder: payload.fieldOrder ?? [],
    icon: payload.icon ?? "",
    totp: payload.totp ?? null,
    attachments: payload.attachments ?? [],
    passkey: payload.passkey ?? null,
  };
}

export function normalizeCard(
  row: VaultRowMeta,
  payload: CardPayload,
): DecryptedCard {
  return {
    kind: "card",
    type: "card",
    uuid: row.uuid,
    collectionUuid: row.collectionUuid,
    revision: row.revision,
    name: payload.name ?? "",
    holder: payload.holder ?? "",
    number: payload.number ?? "",
    expiry: payload.expiry ?? "",
    cvc: payload.cvc ?? "",
    brand: payload.brand,
    notes: payload.notes ?? "",
    bank: payload.bank,
  };
}

export function normalizeCrypto(
  row: VaultRowMeta,
  payload: CryptoPayload,
): DecryptedCrypto {
  return {
    kind: "crypto",
    type: "crypto",
    uuid: row.uuid,
    collectionUuid: row.collectionUuid,
    revision: row.revision,
    name: payload.name ?? "",
    network: payload.network ?? "other",
    address: payload.address ?? "",
    privateKey: payload.privateKey ?? "",
    seedPhrase: payload.seedPhrase ?? "",
    notes: payload.notes ?? "",
    folder: payload.folder ?? "",
  };
}

export function normalizeSecret(
  row: VaultRowMeta,
  payload: SecretPayload & { secretKind?: string },
): DecryptedSecret {
  const secretKind = normalizeSecretKind(
    payload.secretKind ?? payload.kind?.toString(),
  );
  return {
    kind: "secret",
    type: "secret",
    uuid: row.uuid,
    collectionUuid: row.collectionUuid,
    revision: row.revision,
    name: payload.name ?? "",
    secretKind,
    username: payload.username ?? "",
    host: payload.host ?? "",
    publicKey: payload.publicKey ?? "",
    secret: payload.secret ?? "",
    passphrase: payload.passphrase ?? "",
    notes: payload.notes ?? "",
    device: payload.device ?? "",
  };
}

/** Classify a decrypted payload by `type` or reserved collection uuid. */
export function parseVaultItem(
  row: VaultRowMeta,
  raw: Record<string, unknown>,
): VaultItem | null {
  const type = raw.type?.toString();
  if (
    type === "card" ||
    row.collectionUuid === ReservedCollections.wallets
  ) {
    return normalizeCard(row, raw as CardPayload);
  }
  if (
    type === "crypto" ||
    row.collectionUuid === ReservedCollections.crypto
  ) {
    return normalizeCrypto(row, raw as CryptoPayload);
  }
  if (
    type === "secret" ||
    row.collectionUuid === ReservedCollections.secrets
  ) {
    return normalizeSecret(row, raw as SecretPayload & { secretKind?: string });
  }
  if (isReservedCollection(row.collectionUuid)) return null;
  return normalizeLogin(row, raw as EntryPayload);
}

/** Coerce a native-host login blob into DecryptedEntry. */
export function asLoginFromNative(
  e: DecryptedEntry | Record<string, unknown>,
): DecryptedEntry {
  const row = e as DecryptedEntry;
  if (row.kind === "login") {
    const collectionUuid = normalizeFolderId(row.collectionUuid);
    if (collectionUuid === (row.collectionUuid ?? null)) return row;
    return { ...row, collectionUuid };
  }
  return {
    kind: "login",
    uuid: String((e as { uuid?: string }).uuid ?? ""),
    collectionUuid: normalizeFolderId(
      (e as { collectionUuid?: string | null }).collectionUuid,
    ),
    revision: (e as { revision?: number }).revision ?? 1,
    title: String((e as { title?: string }).title ?? ""),
    username: String((e as { username?: string }).username ?? ""),
    password: String((e as { password?: string }).password ?? ""),
    urls: (e as { urls?: string[] }).urls ?? [],
    notes: String((e as { notes?: string }).notes ?? ""),
    tags: (e as { tags?: string[] }).tags ?? [],
    fields: (e as { fields?: EntryPayload["fields"] }).fields ?? [],
    fieldOrder: (e as { fieldOrder?: string[] }).fieldOrder ?? [],
    icon: String((e as { icon?: string }).icon ?? ""),
    totp: (e as { totp?: EntryPayload["totp"] }).totp ?? null,
    attachments:
      (e as { attachments?: EntryPayload["attachments"] }).attachments ?? [],
    passkey: (e as { passkey?: EntryPayload["passkey"] }).passkey ?? null,
  };
}

/** Prefer secrets whose host matches the page origin; API tokens first. */
export function matchSecretsForOrigin(
  secrets: DecryptedSecret[],
  origin: string,
): DecryptedSecret[] {
  let host = "";
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    host = "";
  }
  const scored = secrets.map((s) => {
    let score = 0;
    const h = (s.host || "").toLowerCase().trim();
    if (host && h) {
      if (host === h || host.endsWith(`.${h}`) || h.endsWith(`.${host}`)) {
        score += 100;
      } else if (host.includes(h) || h.includes(host)) {
        score += 40;
      }
    }
    if (s.secretKind === "apiToken") score += 10;
    if (s.secret?.trim()) score += 1;
    return { s, score };
  });
  scored.sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name));
  const matched = scored.filter((x) => x.score >= 40);
  return (matched.length ? matched : scored).map((x) => x.s);
}

export function titleFromUrl(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "") || "Login";
  } catch {
    return "Login";
  }
}

export function urlsFor(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return [];
  try {
    const u = new URL(trimmed);
    return [u.origin];
  } catch {
    return [trimmed];
  }
}

export function secretKindLabelFallback(
  kind: ReturnType<typeof normalizeSecretKind>,
): string {
  switch (kind) {
    case "sshKey":
      return "SSH key";
    case "apiToken":
      return "API token";
    case "envSnippet":
      return ".env";
    default:
      return "Secret";
  }
}

export function mapNativeCollections(
  raw: unknown,
): DecryptedCollection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c): c is Record<string, unknown> =>
        !!c &&
        typeof c === "object" &&
        typeof (c as { uuid?: unknown }).uuid === "string" &&
        !isReservedCollection(String((c as { uuid: string }).uuid)),
    )
    .map((c) => ({
      uuid: String(c.uuid),
      name: String(c.name ?? "") || "Folder",
      icon: String(c.icon ?? "") || "material:folder",
      color: typeof c.color === "number" ? c.color : null,
      parentUuid: normalizeFolderId(
        (c.parentUuid as string | null | undefined) ?? null,
      ),
      sortOrder: Number(c.sortOrder ?? 0),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function asCardFromNative(
  c: DecryptedCard | Record<string, unknown>,
): DecryptedCard {
  const row = c as DecryptedCard;
  return {
    ...row,
    kind: "card",
    type: "card",
    uuid: String(row.uuid ?? ""),
    collectionUuid: String(
      row.collectionUuid ?? ReservedCollections.wallets,
    ),
    revision: Number(row.revision ?? 1),
    name: String(row.name ?? ""),
    holder: String(row.holder ?? ""),
    number: String(row.number ?? ""),
    expiry: String(row.expiry ?? ""),
    cvc: String(row.cvc ?? ""),
    notes: String(row.notes ?? ""),
  };
}

export function asCryptoFromNative(
  w: DecryptedCrypto | Record<string, unknown>,
): DecryptedCrypto {
  const row = w as DecryptedCrypto;
  return {
    ...row,
    kind: "crypto",
    type: "crypto",
    uuid: String(row.uuid ?? ""),
    collectionUuid: String(
      row.collectionUuid ?? ReservedCollections.crypto,
    ),
    revision: Number(row.revision ?? 1),
    name: String(row.name ?? ""),
    network: (row.network as DecryptedCrypto["network"]) ?? "other",
    address: String(row.address ?? ""),
    privateKey: String(row.privateKey ?? ""),
    seedPhrase: String(row.seedPhrase ?? ""),
    notes: String(row.notes ?? ""),
    folder: String(row.folder ?? ""),
  };
}

export function asSecretFromNative(
  s: Record<string, unknown>,
): DecryptedSecret {
  return normalizeSecret(
    {
      uuid: String(s.uuid ?? ""),
      collectionUuid:
        (s.collectionUuid as string | null | undefined) ??
        ReservedCollections.secrets,
      revision: Number(s.revision ?? 1),
    },
    {
      type: "secret",
      name: String(s.name ?? ""),
      kind: String(s.secretKind ?? s.kind ?? "other"),
      secretKind: String(s.secretKind ?? s.kind ?? ""),
      username: String(s.username ?? ""),
      host: String(s.host ?? ""),
      publicKey: String(s.publicKey ?? ""),
      secret: String(s.secret ?? ""),
      passphrase: String(s.passphrase ?? ""),
      notes: String(s.notes ?? ""),
      device: String(s.device ?? ""),
    },
  );
}

export function nativeErrorMessage(error: string | undefined): string {
  const raw = (error ?? "").trim();
  if (!raw || raw === "Request failed" || /timeout/i.test(raw)) {
    return "Couldn’t load the vault from the desktop app. Keep OpenKey unlocked and try again.";
  }
  if (/too large/i.test(raw)) {
    return "The vault is too large to send to the extension. Update the OpenKey desktop app.";
  }
  if (/unknown type/i.test(raw)) {
    return "Couldn’t load the vault from the desktop app. Keep OpenKey unlocked and try again.";
  }
  return raw;
}

/** Older desktops reject `listVault` / `listCollections`; that is not a vault-load failure. */
export function isUnsupportedNativeType(error: string | undefined): boolean {
  return /unknown type/i.test((error ?? "").trim());
}
