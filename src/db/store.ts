import { openDB, type IDBPDatabase } from "idb";
import type {
  StoredAttachment,
  StoredCollection,
  StoredEntry,
  Settings,
} from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";

const DB_NAME = "openkey";
/** v3: optional isSynced on entry/collection values (no store schema change). */
const DB_VERSION = 3;

type OpenKeyDB = {
  entries: {
    key: string;
    value: StoredEntry;
  };
  collections: {
    key: string;
    value: StoredCollection;
  };
  attachments: {
    key: string;
    value: StoredAttachment;
  };
  meta: {
    key: string;
    value: unknown;
  };
};

let dbPromise: Promise<IDBPDatabase<OpenKeyDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<OpenKeyDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore("entries", { keyPath: "uuid" });
          db.createObjectStore("collections", { keyPath: "uuid" });
          db.createObjectStore("meta");
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains("attachments")) {
          db.createObjectStore("attachments", { keyPath: "uuid" });
        }
        // v3: isSynced is an optional field on existing entry/collection values.
      },
    });
  }
  return dbPromise;
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const stored = (await db.get("meta", "settings")) as
    | Partial<Settings>
    | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    passwordGen: {
      ...DEFAULT_SETTINGS.passwordGen,
      ...(stored?.passwordGen ?? {}),
    },
  };
}

export async function saveSettings(
  settings: Partial<Settings>,
): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...settings,
    passwordGen: {
      ...current.passwordGen,
      ...(settings.passwordGen ?? {}),
    },
  };
  const db = await getDb();
  await db.put("meta", next, "settings");
  return next;
}

export async function getVaultMeta(): Promise<{
  email: string;
  saltB64: string;
  wrappedVaultKey: string;
  kdfParams: Record<string, unknown>;
} | null> {
  const db = await getDb();
  return ((await db.get("meta", "vault")) as {
    email: string;
    saltB64: string;
    wrappedVaultKey: string;
    kdfParams: Record<string, unknown>;
  } | undefined) ?? null;
}

export async function saveVaultMeta(meta: {
  email: string;
  saltB64: string;
  wrappedVaultKey: string;
  kdfParams: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  await db.put("meta", meta, "vault");
}

export async function upsertEntries(entries: StoredEntry[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("entries", "readwrite");
  for (const e of entries) await tx.store.put(e);
  await tx.done;
}

export async function upsertCollections(
  collections: StoredCollection[],
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("collections", "readwrite");
  for (const c of collections) await tx.store.put(c);
  await tx.done;
}

export async function upsertAttachments(
  attachments: StoredAttachment[],
): Promise<void> {
  if (!attachments.length) return;
  const db = await getDb();
  const tx = db.transaction("attachments", "readwrite");
  for (const a of attachments) await tx.store.put(a);
  await tx.done;
}

export async function listEntries(): Promise<StoredEntry[]> {
  const db = await getDb();
  const all = await db.getAll("entries");
  return all.filter((e) => !e.isDeleted);
}

/** All entry rows including soft-deleted (for dirty sync push). */
export async function listAllEntries(): Promise<StoredEntry[]> {
  const db = await getDb();
  return db.getAll("entries");
}

export async function getStoredEntry(
  uuid: string,
): Promise<StoredEntry | undefined> {
  const db = await getDb();
  const row = await db.get("entries", uuid);
  if (!row || row.isDeleted) return undefined;
  return row;
}

export async function listCollections(): Promise<StoredCollection[]> {
  const db = await getDb();
  const all = await db.getAll("collections");
  return all.filter((c) => !c.isDeleted);
}

/** All collection rows including soft-deleted (for dirty sync push). */
export async function listAllCollections(): Promise<StoredCollection[]> {
  const db = await getDb();
  return db.getAll("collections");
}

/** Mark local rows clean after a successful push (including no-op LWW). */
export async function markEntriesSynced(uuids: string[]): Promise<void> {
  if (!uuids.length) return;
  const db = await getDb();
  const tx = db.transaction("entries", "readwrite");
  for (const uuid of uuids) {
    const row = await tx.store.get(uuid);
    if (row) await tx.store.put({ ...row, isSynced: true });
  }
  await tx.done;
}

export async function markCollectionsSynced(uuids: string[]): Promise<void> {
  if (!uuids.length) return;
  const db = await getDb();
  const tx = db.transaction("collections", "readwrite");
  for (const uuid of uuids) {
    const row = await tx.store.get(uuid);
    if (row) await tx.store.put({ ...row, isSynced: true });
  }
  await tx.done;
}

export async function getStoredAttachment(
  uuid: string,
): Promise<StoredAttachment | undefined> {
  const db = await getDb();
  const row = await db.get("attachments", uuid);
  if (!row || row.isDeleted) return undefined;
  return row;
}

export async function listAttachmentsForEntry(
  entryUuid: string,
): Promise<StoredAttachment[]> {
  const db = await getDb();
  const all = await db.getAll("attachments");
  return all.filter((a) => !a.isDeleted && a.entryUuid === entryUuid);
}

export async function clearVaultData(): Promise<void> {
  const db = await getDb();
  await db.clear("entries");
  await db.clear("collections");
  if (db.objectStoreNames.contains("attachments")) {
    await db.clear("attachments");
  }
  await db.delete("meta", "serverRevision");
}

/** Opaque sync cursor from last successful `/sync` (`server_revision`). */
export async function getServerRevision(): Promise<number> {
  const db = await getDb();
  const value = await db.get("meta", "serverRevision");
  return typeof value === "number" && value >= 0 ? value : 0;
}

export async function setServerRevision(revision: number): Promise<void> {
  const db = await getDb();
  await db.put("meta", revision, "serverRevision");
}

export async function clearServerRevision(): Promise<void> {
  const db = await getDb();
  await db.delete("meta", "serverRevision");
}
