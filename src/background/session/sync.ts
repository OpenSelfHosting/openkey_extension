/**
 * Sync pull/push and attachment download helpers.
 */
import {
  decryptBytes,
  decryptString,
  toB64Url,
} from "../../crypto/crypto";
import {
  getSettings,
  getStoredAttachment,
  getStoredEntry,
  listAllCollections,
  listAllEntries,
  listAttachmentsForEntry,
  markCollectionsSynced,
  markEntriesSynced,
  upsertAttachments,
  upsertCollections,
  upsertEntries,
} from "../../db/store";
import { selectDirty } from "../../sync/dirty";
import {
  downloadAttachmentBlob,
  syncPull,
  syncPushLocal,
} from "../../sync/api";
import type { EntryPayload, StoredAttachment } from "../../shared/types";
import { isUnlocked } from "./auth";
import { decryptLocalEntries } from "./vault_read";
import { getSession, vaultKeyFromSession } from "./state";

/** Apply server pull and mark successfully pushed local rows as synced. */
export async function applySyncResult(
  pulled: {
    entries: Parameters<typeof upsertEntries>[0];
    collections: Parameters<typeof upsertCollections>[0];
    attachments: Parameters<typeof upsertAttachments>[0];
  },
  pushed?: { entryUuids?: string[]; collectionUuids?: string[] },
): Promise<void> {
  await upsertEntries(pulled.entries);
  await upsertCollections(pulled.collections);
  await upsertAttachments(pulled.attachments);
  if (pushed?.entryUuids?.length) {
    await markEntriesSynced(pushed.entryUuids);
  }
  if (pushed?.collectionUuids?.length) {
    await markCollectionsSynced(pushed.collectionUuids);
  }
}

export async function syncNow(): Promise<void> {
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  const dirtyEntries = selectDirty(await listAllEntries());
  const dirtyCollections = selectDirty(await listAllCollections());
  const pulled =
    dirtyEntries.length || dirtyCollections.length
      ? await syncPushLocal(settings, {
          entries: dirtyEntries,
          collections: dirtyCollections,
        })
      : await syncPull(settings);
  await applySyncResult(pulled, {
    entryUuids: dirtyEntries.map((e) => e.uuid),
    collectionUuids: dirtyCollections.map((c) => c.uuid),
  });
}


export async function listEntryAttachments(entryUuid: string): Promise<
  Array<{ id: string; name: string; size: number; hasCipher: boolean }>
> {
  const session = await getSession();
  if (session.mode === "native") {
    const entry = await decryptLocalEntries().then((es) =>
      es.find((e) => e.uuid === entryUuid),
    );
    return (entry?.attachments ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      size: a.size,
      hasCipher: !!a.cipher,
    }));
  }
  const key = await vaultKeyFromSession();
  const row = await getStoredEntry(entryUuid);
  const fromPayload: Array<{
    id: string;
    name: string;
    size: number;
    hasCipher: boolean;
  }> = [];
  if (row) {
    try {
      const payload = JSON.parse(
        decryptString(key, row.encryptedPayload),
      ) as EntryPayload;
      for (const a of payload.attachments ?? []) {
        fromPayload.push({
          id: a.id,
          name: a.name,
          size: a.size,
          hasCipher: !!a.cipher,
        });
      }
    } catch {
      /* ignore */
    }
  }
  const stored = await listAttachmentsForEntry(entryUuid);
  const seen = new Set(fromPayload.map((a) => a.id));
  for (const a of stored) {
    if (seen.has(a.uuid)) continue;
    fromPayload.push({
      id: a.uuid,
      name: a.filename,
      size: a.sizeBytes,
      hasCipher: !!a.encryptedBlob,
    });
  }
  return fromPayload;
}

export async function downloadAttachment(input: {
  entryUuid: string;
  attachmentId: string;
}): Promise<{ filename: string; bytes: Uint8Array }> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Open attachments from the desktop app in native mode");
  }
  const key = await vaultKeyFromSession();
  const settings = await getSettings();

  let cipher: string | undefined;
  let filename = "attachment";

  const row = await getStoredEntry(input.entryUuid);
  if (row) {
    try {
      const payload = JSON.parse(
        decryptString(key, row.encryptedPayload),
      ) as EntryPayload;
      const meta = payload.attachments?.find((a) => a.id === input.attachmentId);
      if (meta) {
        filename = meta.name || filename;
        cipher = meta.cipher;
      }
    } catch {
      /* ignore */
    }
  }

  const stored = await getStoredAttachment(input.attachmentId);
  if (stored) {
    filename = stored.filename || filename;
    if (!cipher && stored.encryptedBlob) cipher = stored.encryptedBlob;
  }

  if (!cipher && settings.accessToken) {
    const blob = await downloadAttachmentBlob(settings, input.attachmentId);
    cipher = toB64Url(blob);
    const next: StoredAttachment = {
      uuid: input.attachmentId,
      entryUuid: input.entryUuid,
      filename,
      sizeBytes: blob.length,
      contentType: null,
      revision: stored?.revision ?? 1,
      isDeleted: false,
      encryptedBlob: cipher,
      updatedAt: new Date().toISOString(),
    };
    await upsertAttachments([next]);
  }

  if (!cipher) throw new Error("Attachment ciphertext missing");
  const clear = decryptBytes(key, cipher);
  return { filename, bytes: clear };
}

