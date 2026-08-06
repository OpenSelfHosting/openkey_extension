/**
 * Create / update / delete vault items and folders.
 */
import {
  decryptString,
  encryptString,
} from "../../crypto/crypto";
import {
  getSettings,
  getStoredEntry,
  listCollections,
  upsertCollections,
  upsertEntries,
} from "../../db/store";
import {
  tryNativePing,
  nativeRequest,
  type NativeLoginPayload,
} from "../../native/bridge";
import { syncPushEntries, syncWith } from "../../sync/api";
import { applySyncResult } from "./sync";
import {
  buildExport,
  detectAndParseImport,
  type ExportFormat,
} from "../../shared/import_export";
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
  StoredCollection,
  StoredEntry,
} from "../../shared/types";
import {
  ReservedCollections,
  isReservedCollection,
  normalizeSecretKind,
} from "../../shared/types";
import {
  normalizeSecret,
  secretKindLabelFallback,
  titleFromUrl,
  urlsFor,
} from "./mapping";
import { isUnlocked } from "./auth";
import { decryptLocalEntries } from "./vault_read";
import { getSession, vaultKeyFromSession } from "./state";

export async function preferNativeWrite(): Promise<boolean> {
  const session = await getSession();
  if (session.mode === "native" && session.unlocked) return true;
  const settings = await getSettings();
  if (!settings.preferNativeBridge) return false;
  return tryNativePing();
}

async function createStandaloneEntry(
  payload: NativeLoginPayload,
): Promise<void> {
  const key = await vaultKeyFromSession();
  const settings = await getSettings();
  const uuid = crypto.randomUUID();
  const entryPayload: EntryPayload = {
    title: payload.title || "Login",
    username: payload.username,
    password: payload.password,
    urls: payload.urls,
    notes: "",
  };
  const stored: StoredEntry = {
    uuid,
    collectionUuid: null,
    encryptedPayload: encryptString(key, JSON.stringify(entryPayload)),
    revision: 1,
    isDeleted: false,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await upsertEntries([stored]);
  if (settings.accessToken) {
    const pulled = await syncPushEntries(settings, [stored]);
    await applySyncResult(pulled, { entryUuids: [stored.uuid] });
  }
}

async function updateStandaloneEntry(
  uuid: string,
  payload: NativeLoginPayload,
): Promise<void> {
  const key = await vaultKeyFromSession();
  const settings = await getSettings();
  const existing = await getStoredEntry(uuid);
  let base: EntryPayload = {
    title: payload.title || "Login",
    username: payload.username,
    password: payload.password,
    urls: payload.urls,
    notes: "",
  };
  let revision = 1;
  let collectionUuid: string | null = null;
  if (existing) {
    try {
      base = {
        ...(JSON.parse(decryptString(key, existing.encryptedPayload)) as EntryPayload),
        title: payload.title || base.title,
        username: payload.username,
        password: payload.password,
        urls: payload.urls.length ? payload.urls : base.urls,
      };
    } catch {
      /* replace payload */
    }
    revision = existing.revision + 1;
    collectionUuid = existing.collectionUuid;
  }
  const stored: StoredEntry = {
    uuid,
    collectionUuid,
    encryptedPayload: encryptString(key, JSON.stringify(base)),
    revision,
    isDeleted: false,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await upsertEntries([stored]);
  if (settings.accessToken) {
    const pulled = await syncPushEntries(settings, [stored]);
    await applySyncResult(pulled, { entryUuids: [stored.uuid] });
  }
}

export async function saveLogin(input: {
  username: string;
  password: string;
  url: string;
  title?: string;
}): Promise<void> {
  if (!input.password) throw new Error("Password required");
  const entry: NativeLoginPayload = {
    title: input.title?.trim() || titleFromUrl(input.url),
    username: input.username.trim(),
    password: input.password,
    urls: urlsFor(input.url),
  };

  if (await preferNativeWrite()) {
    const res = await nativeRequest({ type: "createEntry", entry }, 8000);
    if (res.ok) return;
    const nativeErr = res.error || "Native save failed";
    // Fall back to standalone vault when the extension itself is unlocked.
    try {
      if ((await isUnlocked()) && (await getSession()).mode !== "native") {
        await createStandaloneEntry(entry);
        return;
      }
    } catch {
      /* surface native error below */
    }
    throw new Error(nativeErr);
  }

  if (!(await isUnlocked())) {
    throw new Error("Unlock OpenKey in the extension popup first");
  }
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error(
      "Desktop app locked — unlock OpenKey or use standalone mode",
    );
  }
  await createStandaloneEntry(entry);
}

export async function updateLogin(input: {
  uuid: string;
  username: string;
  password: string;
  url: string;
  title?: string;
}): Promise<void> {
  if (!input.uuid) throw new Error("Missing entry id");
  if (!input.password) throw new Error("Password required");
  const entry: NativeLoginPayload = {
    title: input.title?.trim() || titleFromUrl(input.url),
    username: input.username.trim(),
    password: input.password,
    urls: urlsFor(input.url),
  };

  if (await preferNativeWrite()) {
    const res = await nativeRequest(
      { type: "updateEntry", uuid: input.uuid, entry },
      8000,
    );
    if (res.ok) return;
    const nativeErr = res.error || "Native update failed";
    try {
      if ((await isUnlocked()) && (await getSession()).mode !== "native") {
        await updateStandaloneEntry(input.uuid, entry);
        return;
      }
    } catch {
      /* surface native error */
    }
    throw new Error(nativeErr);
  }

  if (!(await isUnlocked())) {
    throw new Error("Unlock OpenKey in the extension popup first");
  }
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error(
      "Desktop app locked — unlock OpenKey or use standalone mode",
    );
  }
  await updateStandaloneEntry(input.uuid, entry);
}


export async function createStandaloneEntryFull(
  payload: NativeLoginPayload,
): Promise<string> {
  const key = await vaultKeyFromSession();
  const settings = await getSettings();
  const uuid = crypto.randomUUID();
  const entryPayload: EntryPayload = {
    title: payload.title || "Login",
    username: payload.username,
    password: payload.password,
    urls: payload.urls,
    notes: payload.notes ?? "",
    passkey: payload.passkey ?? null,
  };
  const stored: StoredEntry = {
    uuid,
    collectionUuid: null,
    encryptedPayload: encryptString(key, JSON.stringify(entryPayload)),
    revision: 1,
    isDeleted: false,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await upsertEntries([stored]);
  if (settings.accessToken) {
    const pulled = await syncPushEntries(settings, [stored]);
    await applySyncResult(pulled, { entryUuids: [stored.uuid] });
  }
  return uuid;
}

export async function updateStandaloneEntryFull(
  uuid: string,
  payload: NativeLoginPayload,
): Promise<void> {
  const key = await vaultKeyFromSession();
  const settings = await getSettings();
  const existing = await getStoredEntry(uuid);
  let base: EntryPayload = {
    title: payload.title || "Login",
    username: payload.username,
    password: payload.password,
    urls: payload.urls,
    notes: payload.notes ?? "",
    passkey: payload.passkey ?? null,
  };
  let revision = 1;
  let collectionUuid: string | null = null;
  if (existing) {
    try {
      const prev = JSON.parse(
        decryptString(key, existing.encryptedPayload),
      ) as EntryPayload;
      base = {
        ...prev,
        title: payload.title || prev.title,
        username: payload.username || prev.username,
        password: payload.password || prev.password,
        urls: payload.urls.length ? payload.urls : prev.urls,
        notes: payload.notes ?? prev.notes,
        passkey: payload.passkey !== undefined ? payload.passkey : prev.passkey,
      };
    } catch {
      /* replace */
    }
    revision = existing.revision + 1;
    collectionUuid = existing.collectionUuid;
  }
  const stored: StoredEntry = {
    uuid,
    collectionUuid,
    encryptedPayload: encryptString(key, JSON.stringify(base)),
    revision,
    isDeleted: false,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await upsertEntries([stored]);
  if (settings.accessToken) {
    const pulled = await syncPushEntries(settings, [stored]);
    await applySyncResult(pulled, { entryUuids: [stored.uuid] });
  }
}


export async function listDecryptedCollections(): Promise<DecryptedCollection[]> {
  if (!(await isUnlocked())) return [];
  const session = await getSession();
  if (session.mode === "native") {
    // Desktop bridge does not expose folders yet — flat vault in native mode.
    return [];
  }
  const key = await vaultKeyFromSession();
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
      icon: row.icon || "folder",
      color: row.color,
      parentUuid: row.parentUuid,
      sortOrder: row.sortOrder,
    });
  }
  return out.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

export async function pushStored(stored: StoredEntry): Promise<void> {
  await upsertEntries([{ ...stored, isSynced: false }]);
  const settings = await getSettings();
  if (settings.accessToken) {
    const pulled = await syncPushEntries(settings, [stored]);
    await applySyncResult(pulled, { entryUuids: [stored.uuid] });
  }
}

export async function upsertLoginEntry(input: {
  uuid?: string;
  collectionUuid?: string | null;
  payload: EntryPayload;
}): Promise<DecryptedEntry> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  const payload: EntryPayload = {
    ...input.payload,
    type: "login",
    title: input.payload.title?.trim() || "Login",
    username: input.payload.username ?? "",
    password: input.payload.password ?? "",
    urls: input.payload.urls ?? [],
    notes: input.payload.notes ?? "",
  };

  if (session.mode === "native" || (await preferNativeWrite())) {
    const nativePayload: NativeLoginPayload = {
      title: payload.title,
      username: payload.username,
      password: payload.password,
      urls: payload.urls,
      notes: payload.notes,
      passkey: payload.passkey,
    };
    if (input.uuid) {
      const res = await nativeRequest(
        { type: "updateEntry", uuid: input.uuid, entry: nativePayload },
        8000,
      );
      if (!res.ok) throw new Error(res.error || "Native update failed");
      return {
        kind: "login",
        uuid: input.uuid,
        collectionUuid: input.collectionUuid ?? null,
        revision: 1,
        ...payload,
      };
    }
    const res = await nativeRequest(
      { type: "createEntry", entry: nativePayload },
      8000,
    );
    if (!res.ok) throw new Error(res.error || "Native create failed");
    const uuid =
      "entry" in res && res.entry?.uuid ? res.entry.uuid : crypto.randomUUID();
    return {
      kind: "login",
      uuid,
      collectionUuid: input.collectionUuid ?? null,
      revision: 1,
      ...payload,
    };
  }

  const key = await vaultKeyFromSession();
  const uuid = input.uuid ?? crypto.randomUUID();
  let revision = 1;
  let collectionUuid = input.collectionUuid ?? null;
  if (input.uuid) {
    const existing = await getStoredEntry(input.uuid);
    if (existing) {
      revision = existing.revision + 1;
      if (input.collectionUuid === undefined) {
        collectionUuid = existing.collectionUuid;
      }
      try {
        const prev = JSON.parse(
          decryptString(key, existing.encryptedPayload),
        ) as EntryPayload;
        payload.attachments = payload.attachments ?? prev.attachments;
        payload.passkey = payload.passkey ?? prev.passkey;
        payload.fieldOrder = payload.fieldOrder ?? prev.fieldOrder;
        payload.icon = payload.icon ?? prev.icon;
        payload.tags = payload.tags ?? prev.tags;
        payload.fields = payload.fields ?? prev.fields;
        payload.totp = payload.totp !== undefined ? payload.totp : prev.totp;
      } catch {
        /* replace */
      }
    }
  }
  const stored: StoredEntry = {
    uuid,
    collectionUuid,
    encryptedPayload: encryptString(key, JSON.stringify(payload)),
    revision,
    isDeleted: false,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await pushStored(stored);
  return {
    kind: "login",
    uuid,
    collectionUuid,
    revision,
    ...payload,
  };
}

export async function upsertCardEntry(input: {
  uuid?: string;
  payload: CardPayload;
}): Promise<DecryptedCard> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Edit cards in the OpenKey desktop app");
  }
  const key = await vaultKeyFromSession();
  const payload: CardPayload = {
    ...input.payload,
    type: "card",
    name: input.payload.name?.trim() || "Card",
    holder: input.payload.holder ?? "",
    number: input.payload.number ?? "",
    expiry: input.payload.expiry ?? "",
    cvc: input.payload.cvc ?? "",
  };
  const uuid = input.uuid ?? crypto.randomUUID();
  let revision = 1;
  if (input.uuid) {
    const existing = await getStoredEntry(input.uuid);
    if (existing) revision = existing.revision + 1;
  }
  const stored: StoredEntry = {
    uuid,
    collectionUuid: ReservedCollections.wallets,
    encryptedPayload: encryptString(key, JSON.stringify(payload)),
    revision,
    isDeleted: false,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await pushStored(stored);
  return {
    kind: "card",
    uuid,
    collectionUuid: ReservedCollections.wallets,
    revision,
    ...payload,
  };
}

export async function upsertCryptoEntry(input: {
  uuid?: string;
  payload: CryptoPayload;
}): Promise<DecryptedCrypto> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Edit crypto wallets in the OpenKey desktop app");
  }
  const key = await vaultKeyFromSession();
  const payload: CryptoPayload = {
    ...input.payload,
    type: "crypto",
    name: input.payload.name?.trim() || "Wallet",
    network: input.payload.network ?? "",
    address: input.payload.address ?? "",
  };
  const uuid = input.uuid ?? crypto.randomUUID();
  let revision = 1;
  if (input.uuid) {
    const existing = await getStoredEntry(input.uuid);
    if (existing) revision = existing.revision + 1;
  }
  const stored: StoredEntry = {
    uuid,
    collectionUuid: ReservedCollections.crypto,
    encryptedPayload: encryptString(key, JSON.stringify(payload)),
    revision,
    isDeleted: false,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await pushStored(stored);
  return {
    kind: "crypto",
    uuid,
    collectionUuid: ReservedCollections.crypto,
    revision,
    ...payload,
  };
}

export async function upsertSecretEntry(input: {
  uuid?: string;
  payload: SecretPayload;
}): Promise<DecryptedSecret> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Edit secrets in the OpenKey desktop app");
  }
  const key = await vaultKeyFromSession();
  const secretKind = normalizeSecretKind(input.payload.kind);
  const payload: SecretPayload = {
    type: "secret",
    name: input.payload.name?.trim() || secretKindLabelFallback(secretKind),
    kind: secretKind,
    username: input.payload.username ?? "",
    host: input.payload.host ?? "",
    publicKey: input.payload.publicKey ?? "",
    secret: input.payload.secret ?? "",
    passphrase: input.payload.passphrase ?? "",
    notes: input.payload.notes ?? "",
    device: input.payload.device ?? "",
  };
  const uuid = input.uuid ?? crypto.randomUUID();
  let revision = 1;
  if (input.uuid) {
    const existing = await getStoredEntry(input.uuid);
    if (existing) revision = existing.revision + 1;
  }
  const stored: StoredEntry = {
    uuid,
    collectionUuid: ReservedCollections.secrets,
    encryptedPayload: encryptString(key, JSON.stringify(payload)),
    revision,
    isDeleted: false,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await pushStored(stored);
  return normalizeSecret(
    { uuid, collectionUuid: ReservedCollections.secrets, revision },
    payload,
  );
}

export async function deleteVaultEntry(
  uuid: string,
  opts?: { kind?: "login" | "card" | "crypto" | "secret" },
): Promise<void> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    if (opts?.kind === "secret") {
      const secretRes = await nativeRequest(
        { type: "deleteSecret", uuid },
        8000,
      );
      if (!secretRes.ok) {
        throw new Error(
          ("error" in secretRes ? secretRes.error : null) ||
            "Native delete failed",
        );
      }
      return;
    }
    if (opts?.kind === "card" || opts?.kind === "crypto") {
      throw new Error("Delete this item in the OpenKey desktop app");
    }
    const res = await nativeRequest({ type: "deleteEntry", uuid }, 8000);
    if (!res.ok) {
      // Unknown kind: try secret handler as fallback.
      if (!opts?.kind) {
        const secretRes = await nativeRequest(
          { type: "deleteSecret", uuid },
          8000,
        );
        if (secretRes.ok) return;
      }
      throw new Error(
        ("error" in res ? res.error : null) || "Native delete failed",
      );
    }
    return;
  }
  const existing = await getStoredEntry(uuid);
  if (!existing) throw new Error("Entry not found");
  const stored: StoredEntry = {
    ...existing,
    isDeleted: true,
    revision: existing.revision + 1,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await pushStored(stored);
}


export async function moveLoginToFolder(input: {
  uuid: string;
  collectionUuid: string | null;
}): Promise<void> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Move items in the OpenKey desktop app");
  }
  const key = await vaultKeyFromSession();
  const existing = await getStoredEntry(input.uuid);
  if (!existing) throw new Error("Entry not found");
  const payload = JSON.parse(
    decryptString(key, existing.encryptedPayload),
  ) as EntryPayload;
  await upsertLoginEntry({
    uuid: input.uuid,
    collectionUuid: input.collectionUuid,
    payload,
  });
}

export async function renameFolder(input: {
  uuid: string;
  name: string;
}): Promise<void> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Rename folders in the OpenKey desktop app");
  }
  const name = input.name.trim();
  if (!name) throw new Error("Name required");
  const key = await vaultKeyFromSession();
  const rows = await listCollections();
  const existing = rows.find((c) => c.uuid === input.uuid);
  if (!existing) throw new Error("Folder not found");
  const stored: StoredCollection = {
    ...existing,
    encryptedName: encryptString(key, name),
    revision: existing.revision + 1,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await upsertCollections([stored]);
  const settings = await getSettings();
  if (settings.accessToken) {
    const result = await syncWith(settings, {
      collections: [
        {
          uuid: stored.uuid,
          encrypted_name: stored.encryptedName,
          icon: stored.icon,
          color: stored.color,
          parent_uuid: stored.parentUuid,
          sort_order: stored.sortOrder,
          revision: stored.revision,
          is_deleted: stored.isDeleted,
        },
      ],
      entries: [],
    });
    await applySyncResult(result, { collectionUuids: [stored.uuid] });
  }
}

export async function deleteFolder(uuid: string): Promise<void> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Delete folders in the OpenKey desktop app");
  }
  const rows = await listCollections();
  const existing = rows.find((c) => c.uuid === uuid);
  if (!existing) throw new Error("Folder not found");
  const stored: StoredCollection = {
    ...existing,
    isDeleted: true,
    revision: existing.revision + 1,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await upsertCollections([stored]);
  const settings = await getSettings();
  if (settings.accessToken) {
    const result = await syncWith(settings, {
      collections: [
        {
          uuid: stored.uuid,
          encrypted_name: stored.encryptedName,
          icon: stored.icon,
          color: stored.color,
          parent_uuid: stored.parentUuid,
          sort_order: stored.sortOrder,
          revision: stored.revision,
          is_deleted: true,
        },
      ],
      entries: [],
    });
    await applySyncResult(result, { collectionUuids: [stored.uuid] });
  }
}


export async function createFolder(input: {
  name: string;
  parentUuid?: string | null;
}): Promise<DecryptedCollection> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Create folders in the OpenKey desktop app");
  }
  const name = input.name.trim();
  if (!name) throw new Error("Folder name required");
  const key = await vaultKeyFromSession();
  const uuid = crypto.randomUUID();
  const stored: StoredCollection = {
    uuid,
    encryptedName: encryptString(key, name),
    icon: "folder",
    color: null,
    parentUuid: input.parentUuid ?? null,
    sortOrder: Date.now(),
    revision: 1,
    isDeleted: false,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await upsertCollections([stored]);
  const settings = await getSettings();
  if (settings.accessToken) {
    const result = await syncWith(settings, {
      collections: [
        {
          uuid: stored.uuid,
          encrypted_name: stored.encryptedName,
          icon: stored.icon,
          color: stored.color,
          parent_uuid: stored.parentUuid,
          sort_order: stored.sortOrder,
          revision: stored.revision,
          is_deleted: stored.isDeleted,
        },
      ],
      entries: [],
    });
    await applySyncResult(result, { collectionUuids: [stored.uuid] });
  }
  return {
    uuid,
    name,
    icon: "folder",
    color: null,
    parentUuid: stored.parentUuid,
    sortOrder: stored.sortOrder,
  };
}


export async function importLogins(input: {
  raw: string;
  formatHint?: string;
}): Promise<{ imported: number }> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Import in standalone mode or the desktop app");
  }
  const items = detectAndParseImport(input.raw, input.formatHint);
  if (!items.length) throw new Error("No login items found in file");

  const folderByName = new Map<string, string>();
  for (const col of await listDecryptedCollections()) {
    folderByName.set(col.name.toLowerCase(), col.uuid);
  }

  let imported = 0;
  for (const item of items) {
    let collectionUuid: string | null = null;
    if (item.folder?.trim()) {
      const keyName = item.folder.trim().toLowerCase();
      if (folderByName.has(keyName)) {
        collectionUuid = folderByName.get(keyName)!;
      } else {
        const folder = await createFolder({ name: item.folder.trim() });
        folderByName.set(keyName, folder.uuid);
        collectionUuid = folder.uuid;
      }
    }
    await upsertLoginEntry({
      collectionUuid,
      payload: {
        title: item.title,
        username: item.username,
        password: item.password,
        urls: item.urls,
        notes: item.notes,
        totp: item.totp ?? null,
      },
    });
    imported++;
  }
  return { imported };
}

export async function exportVault(
  format: ExportFormat,
): Promise<{ content: string; filename: string; mime: string }> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const entries = await decryptLocalEntries();
  const collections = await listDecryptedCollections();
  return buildExport(format, entries, collections);
}

