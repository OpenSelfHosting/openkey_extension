/**
 * Dirty-tracking helpers for extension ↔ server sync.
 * Missing `isSynced` is treated as dirty (one-time migration push).
 */

export function needsSync(row: { isSynced?: boolean }): boolean {
  return row.isSynced !== true;
}

export function selectDirty<T extends { isSynced?: boolean }>(rows: T[]): T[] {
  return rows.filter(needsSync);
}
