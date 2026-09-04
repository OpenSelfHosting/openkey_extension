/**
 * Public session API for the extension background — thin re-export facade.
 * Implementations live under ./session/*.
 */
export { matchSecretsForOrigin } from "./session/mapping";
export type { CaptureDecision, VaultSnapshot } from "./session/vault_read";
export type { CapturePersistResult } from "./session/vault_write";

export {
  lock,
  isUnlocked,
  unlockStandalone,
  registerStandalone,
  linkVaultMeta,
  unlockViaNative,
  deleteAccount,
  changeMasterPassword,
  publishIdentityKeys,
} from "./session/auth";

export {
  scheduleAutoLock,
  syncActionBadge,
  exposeSessionToPages,
} from "./session/state";

export { syncNow, listEntryAttachments, downloadAttachment } from "./session/sync";

export {
  decryptLocalItems,
  decryptLocalEntries,
  decryptLocalCards,
  decryptLocalCrypto,
  decryptLocalSecrets,
  listDecryptedCollections,
  listVaultSnapshot,
  secretsForOrigin,
  matchEntriesForOrigin,
  entriesForOrigin,
  decideCapture,
} from "./session/vault_read";

export {
  persistCapturedLogin,
  saveLogin,
  updateLogin,
  upsertLoginEntry,
  upsertCardEntry,
  upsertCryptoEntry,
  upsertSecretEntry,
  deleteVaultEntry,
  moveLoginToFolder,
  renameFolder,
  deleteFolder,
  createFolder,
  importLogins,
  exportVault,
} from "./session/vault_write";

export type {
  PasskeyPrepareCreateResult,
  PasskeyPrepareGetResult,
} from "./session/passkeys";
export {
  preparePasskeyCreate,
  preparePasskeyGet,
  performPasskeyCreate,
  performPasskeyGet,
} from "./session/passkeys";

export type { OrgSummary } from "./session/shares_orgs";
export {
  loadShares,
  acceptIncomingShare,
  revokeOutgoingShare,
  shareEntryWithEmail,
  loadOrgs,
  loadOrgMembers,
  inviteToOrganization,
  createOrganizationCollection,
  createOrganizationEntry,
  deleteOrganizationEntry,
  removeMemberFromOrg,
  leaveOrg,
  loadPendingInvites,
  acceptPendingInvite,
  createOrganization,
} from "./session/shares_orgs";
