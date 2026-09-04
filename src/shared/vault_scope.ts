/**
 * Folder / login scoping — matches OpenKey_app CollectionBloc + EntryBloc.
 *
 * Root folders have a null/empty parent. Root logins have a null/empty
 * collectionUuid. Nested content is only visible after opening that folder.
 */

import type { DecryptedCollection, DecryptedEntry } from "./types";
import { fillUsername } from "./types";

/** Treat missing, blank, and `__root__` as vault root. */
export function normalizeFolderId(
  id: string | null | undefined,
): string | null {
  if (id == null) return null;
  const trimmed = String(id).trim();
  if (!trimmed || trimmed === "__root__" || trimmed === "null") return null;
  return trimmed;
}

export function childFolders(
  collections: DecryptedCollection[],
  parentId: string | null | undefined,
): DecryptedCollection[] {
  const parent = normalizeFolderId(parentId);
  return collections.filter(
    (c) => normalizeFolderId(c.parentUuid) === parent,
  );
}

export function entriesInFolder(
  entries: DecryptedEntry[],
  folderId: string | null | undefined,
  opts?: { searching?: boolean; collections?: { uuid: string }[] },
): DecryptedEntry[] {
  if (opts?.searching) return entries;
  const folder = normalizeFolderId(folderId);
  if (folder == null) {
    // No folder catalog (native host not yet listing collections) → flat vault.
    if (!opts?.collections?.length) return entries;
    return entries.filter((e) => normalizeFolderId(e.collectionUuid) == null);
  }
  return entries.filter(
    (e) => normalizeFolderId(e.collectionUuid) === folder,
  );
}

export function entryMatchesTags(
  entry: Pick<DecryptedEntry, "tags">,
  tags: string[],
): boolean {
  if (!tags.length) return true;
  const have = entry.tags ?? [];
  return tags.some((t) => have.includes(t));
}

export function entryMatchesQuery(
  entry: DecryptedEntry,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (entry.title || "").toLowerCase().includes(q) ||
    fillUsername(entry).toLowerCase().includes(q) ||
    (entry.notes || "").toLowerCase().includes(q) ||
    entry.urls.some((u) => u.toLowerCase().includes(q)) ||
    (entry.tags ?? []).some((t) => t.toLowerCase().includes(q))
  );
}

export function folderMatchesQuery(
  folder: Pick<DecryptedCollection, "name">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return folder.name.toLowerCase().includes(q);
}

/** Ancestors from root → folder, for opening a match from search. */
export function folderStackTo(
  collections: DecryptedCollection[],
  uuid: string,
): DecryptedCollection[] {
  const byId = new Map(collections.map((c) => [c.uuid, c]));
  const stack: DecryptedCollection[] = [];
  const seen = new Set<string>();
  let cursor: string | null = uuid;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const col = byId.get(cursor);
    if (!col) break;
    stack.unshift(col);
    cursor = normalizeFolderId(col.parentUuid);
  }
  return stack;
}

export function countEntriesInFolder(
  entries: DecryptedEntry[],
  folderUuid: string,
): number {
  const id = normalizeFolderId(folderUuid);
  if (!id) return 0;
  return entries.filter((e) => normalizeFolderId(e.collectionUuid) === id)
    .length;
}

export function entriesCountLabel(count: number): string {
  if (count === 1) return "1 entry";
  return `${count} entries`;
}
