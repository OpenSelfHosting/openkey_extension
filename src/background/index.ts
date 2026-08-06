import {
  entriesForOrigin,
  isUnlocked,
  linkVaultMeta,
  lock,
  syncNow,
  unlockStandalone,
  registerStandalone,
  unlockViaNative,
  decryptLocalEntries,
  decryptLocalCards,
  decryptLocalCrypto,
  decryptLocalSecrets,
  secretsForOrigin,
  decideCapture,
  saveLogin,
  updateLogin,
  preparePasskeyCreate,
  preparePasskeyGet,
  performPasskeyCreate,
  performPasskeyGet,
  listEntryAttachments,
  downloadAttachment,
  loadShares,
  acceptIncomingShare,
  revokeOutgoingShare,
  shareEntryWithEmail,
  loadOrgs,
  loadPendingInvites,
  acceptPendingInvite,
  listDecryptedCollections,
  upsertLoginEntry,
  upsertCardEntry,
  upsertCryptoEntry,
  upsertSecretEntry,
  deleteVaultEntry,
  changeMasterPassword,
  publishIdentityKeys,
  createFolder,
  createOrganization,
  importLogins,
  exportVault,
  loadOrgMembers,
  inviteToOrganization,
  createOrganizationCollection,
  createOrganizationEntry,
  deleteOrganizationEntry,
  deleteAccount,
  renameFolder,
  deleteFolder,
  removeMemberFromOrg,
  leaveOrg,
  moveLoginToFolder,
  scheduleAutoLock,
  syncActionBadge,
} from "./session";
import {
  generatePassword,
  type GeneratePasswordOpts,
} from "../crypto/crypto";
import { getSettings, getVaultMeta, saveSettings } from "../db/store";
import type { ShareRecord } from "../sync/api";
import type {
  CardPayload,
  CryptoPayload,
  DecryptedEntry,
  EntryPayload,
  PasswordGenOptions,
  SecretPayload,
} from "../shared/types";
import {
  DEFAULT_PASSWORD_GEN,
  fillUsername,
} from "../shared/types";
import type { ExportFormat } from "../shared/import_export";
import { generateTotp } from "../shared/totp";
import { getSession } from "./session/state";

void syncActionBadge();

/** Attach a current TOTP code so content scripts can fill OTP fields. */
function withTotp(entry: DecryptedEntry): DecryptedEntry & { totpCode?: string } {
  if (!entry.totp?.secret) return entry;
  try {
    return { ...entry, totpCode: generateTotp(entry.totp) };
  } catch {
    return entry;
  }
}

async function clipboardClearMs(): Promise<number> {
  const settings = await getSettings();
  const sec = settings.clipboardClearSeconds ?? 30;
  return sec > 0 ? sec * 1000 : 0;
}

async function toastInTab(tabId: number, message: string): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "OPENKEY_TOAST",
      message,
    });
  } catch {
    /* no content script */
  }
}

async function copyFieldInTab(
  tabId: number,
  url: string,
  field: "username" | "password",
): Promise<void> {
  if (!(await isUnlocked())) {
    await toastInTab(tabId, "Unlock OpenKey to copy");
    return;
  }
  const matches = await entriesForOrigin(url);
  if (!matches.length) {
    await toastInTab(tabId, "No logins for this site — save one in OpenKey");
    return;
  }
  const clearAfterMs = await clipboardClearMs();
  if (matches.length === 1) {
    const entry = matches[0]!;
    const text =
      field === "password" ? entry.password : fillUsername(entry);
    if (!text) {
      await toastInTab(
        tabId,
        field === "password" ? "No password stored" : "No username stored",
      );
      return;
    }
    await chrome.tabs.sendMessage(tabId, {
      type: "OPENKEY_COPY",
      text,
      label: field === "password" ? "Password" : "Username",
      clearAfterMs,
    });
    return;
  }
  await chrome.tabs.sendMessage(tabId, {
    type: "OPENKEY_PICK_COPY",
    entries: matches,
    field,
    clearAfterMs,
  });
}

async function fillLoginInTab(tabId: number, url: string): Promise<void> {
  if (!(await isUnlocked())) {
    await toastInTab(tabId, "Unlock OpenKey to autofill");
    return;
  }
  const matches = await entriesForOrigin(url);
  if (!matches.length) {
    await toastInTab(tabId, "No logins for this site — save one in OpenKey");
    return;
  }
  const entries = matches.map(withTotp);
  if (entries.length === 1) {
    await chrome.tabs.sendMessage(tabId, {
      type: "OPENKEY_FILL",
      entry: entries[0],
    });
    return;
  }
  await chrome.tabs.sendMessage(tabId, {
    type: "OPENKEY_PICK_LOGIN",
    entries,
  });
}

async function fillCardInTab(tabId: number): Promise<void> {
  if (!(await isUnlocked())) {
    await toastInTab(tabId, "Unlock OpenKey to autofill");
    return;
  }
  const cards = await decryptLocalCards();
  if (!cards.length) {
    await toastInTab(tabId, "No cards in your vault");
    return;
  }
  if (cards.length === 1) {
    await chrome.tabs.sendMessage(tabId, {
      type: "OPENKEY_FILL_CARD",
      card: cards[0],
    });
    return;
  }
  await chrome.tabs.sendMessage(tabId, {
    type: "OPENKEY_PICK_CARD",
    cards,
  });
}

async function fillSecretInTab(tabId: number, url: string): Promise<void> {
  if (!(await isUnlocked())) {
    await toastInTab(tabId, "Unlock OpenKey to autofill");
    return;
  }
  const secrets = await secretsForOrigin(url);
  if (!secrets.length) {
    await toastInTab(tabId, "No matching secrets for this site");
    return;
  }
  if (secrets.length === 1) {
    await chrome.tabs.sendMessage(tabId, {
      type: "OPENKEY_FILL_SECRET",
      secret: secrets[0],
    });
    return;
  }
  await chrome.tabs.sendMessage(tabId, {
    type: "OPENKEY_PICK_SECRET",
    secrets,
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void syncActionBadge();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "openkey-fill",
      title: "Fill with OpenKey",
      contexts: ["editable", "page"],
    });
    chrome.contextMenus.create({
      id: "openkey-fill-card",
      title: "Fill card with OpenKey",
      contexts: ["editable", "page"],
    });
    chrome.contextMenus.create({
      id: "openkey-fill-token",
      title: "Fill API token with OpenKey",
      contexts: ["editable", "page"],
    });
    chrome.contextMenus.create({
      id: "openkey-copy-username",
      title: "Copy username (OpenKey)",
      contexts: ["editable", "page"],
    });
    chrome.contextMenus.create({
      id: "openkey-copy-password",
      title: "Copy password (OpenKey)",
      contexts: ["editable", "page"],
    });
    chrome.contextMenus.create({
      id: "openkey-generate-password",
      title: "Generate password (OpenKey)",
      contexts: ["editable", "page"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !tab.url) return;
  if (info.menuItemId === "openkey-fill") {
    await fillLoginInTab(tab.id, tab.url);
    return;
  }
  if (info.menuItemId === "openkey-fill-card") {
    await fillCardInTab(tab.id);
    return;
  }
  if (info.menuItemId === "openkey-fill-token") {
    await fillSecretInTab(tab.id, tab.url);
    return;
  }
  if (info.menuItemId === "openkey-copy-username") {
    await copyFieldInTab(tab.id, tab.url, "username");
    return;
  }
  if (info.menuItemId === "openkey-copy-password") {
    await copyFieldInTab(tab.id, tab.url, "password");
    return;
  }
  if (info.menuItemId === "openkey-generate-password") {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "OPENKEY_GENERATE_PASSWORD",
      });
    } catch {
      await toastInTab(tab.id, "Open this page to generate a password");
    }
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "fill-password") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;
  await fillLoginInTab(tab.id, tab.url);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    try {
      switch (message.type) {
        case "GET_STATUS": {
          const meta = await getVaultMeta();
          const session = await getSession();
          const unlocked = await isUnlocked();
          sendResponse({
            unlocked,
            mode: unlocked ? (session.mode ?? "standalone") : null,
            settings: await getSettings(),
            extensionId: chrome.runtime.id,
            email: meta?.email ?? null,
          });
          break;
        }
        case "UNLOCK":
          await unlockStandalone(
            message.email,
            message.password,
            message.serverUrl,
          );
          sendResponse({ ok: true });
          break;
        case "REGISTER":
          await registerStandalone(
            message.email,
            message.password,
            message.serverUrl,
          );
          sendResponse({ ok: true });
          break;
        case "UNLOCK_NATIVE": {
          const result = await unlockViaNative();
          sendResponse(result);
          break;
        }
        case "LOCK":
          await lock();
          sendResponse({ ok: true });
          break;
        case "TOUCH_SESSION":
          if (await isUnlocked()) scheduleAutoLock();
          sendResponse({ ok: true });
          break;
        case "LINK_VAULT":
          await linkVaultMeta(message.meta);
          sendResponse({ ok: true });
          break;
        case "SAVE_SETTINGS":
          sendResponse({ settings: await saveSettings(message.settings) });
          break;
        case "SYNC":
          await syncNow();
          sendResponse({ ok: true });
          break;
        case "LIST_ENTRIES":
          sendResponse({ entries: await decryptLocalEntries() });
          break;
        case "LIST_CARDS":
          sendResponse({ cards: await decryptLocalCards() });
          break;
        case "LIST_CRYPTO":
          sendResponse({ wallets: await decryptLocalCrypto() });
          break;
        case "LIST_SECRETS":
          sendResponse({ secrets: await decryptLocalSecrets() });
          break;
        case "LIST_ATTACHMENTS":
          sendResponse({
            attachments: await listEntryAttachments(String(message.entryUuid ?? "")),
          });
          break;
        case "DOWNLOAD_ATTACHMENT": {
          const file = await downloadAttachment({
            entryUuid: String(message.entryUuid ?? ""),
            attachmentId: String(message.attachmentId ?? ""),
          });
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < file.bytes.length; i += chunk) {
            binary += String.fromCharCode(...file.bytes.subarray(i, i + chunk));
          }
          sendResponse({
            ok: true,
            filename: file.filename,
            bytesB64: btoa(binary),
          });
          break;
        }
        case "LIST_SHARES":
          sendResponse({ shares: await loadShares() });
          break;
        case "ACCEPT_SHARE":
          await acceptIncomingShare(message.share as ShareRecord);
          sendResponse({ ok: true });
          break;
        case "REVOKE_SHARE":
          await revokeOutgoingShare(String(message.uuid ?? ""));
          sendResponse({ ok: true });
          break;
        case "SHARE_ENTRY":
          await shareEntryWithEmail({
            entryUuid: String(message.entryUuid ?? ""),
            recipientEmail: String(message.recipientEmail ?? ""),
          });
          sendResponse({ ok: true });
          break;
        case "LIST_ORGS":
          sendResponse({ orgs: await loadOrgs() });
          break;
        case "LIST_INVITES":
          sendResponse({ invites: await loadPendingInvites() });
          break;
        case "ACCEPT_INVITE":
          await acceptPendingInvite(String(message.inviteId ?? ""));
          sendResponse({ ok: true });
          break;
        case "ENTRIES_FOR_ORIGIN": {
          const origin = message.origin || sender.tab?.url || "";
          const entries = await entriesForOrigin(origin);
          sendResponse({
            entries: entries.map((e) => {
              const withCode = withTotp(e);
              return {
                ...withCode,
                passkey: withCode.passkey
                  ? {
                      ...withCode.passkey,
                      privateKeyCipher: undefined,
                    }
                  : withCode.passkey,
              };
            }),
          });
          break;
        }
        case "LIST_CARDS_FOR_FILL":
          sendResponse({ cards: await decryptLocalCards() });
          break;
        case "LIST_SECRETS_FOR_FILL": {
          const origin = message.origin || sender.tab?.url || "";
          sendResponse({ secrets: await secretsForOrigin(origin) });
          break;
        }
        case "LIST_COLLECTIONS":
          sendResponse({ collections: await listDecryptedCollections() });
          break;
        case "UPSERT_LOGIN":
          sendResponse({
            ok: true,
            entry: await upsertLoginEntry({
              uuid: message.uuid ? String(message.uuid) : undefined,
              collectionUuid:
                message.collectionUuid === undefined
                  ? undefined
                  : (message.collectionUuid as string | null),
              payload: message.payload as EntryPayload,
            }),
          });
          break;
        case "UPSERT_CARD":
          sendResponse({
            ok: true,
            card: await upsertCardEntry({
              uuid: message.uuid ? String(message.uuid) : undefined,
              payload: message.payload as CardPayload,
            }),
          });
          break;
        case "UPSERT_CRYPTO":
          sendResponse({
            ok: true,
            wallet: await upsertCryptoEntry({
              uuid: message.uuid ? String(message.uuid) : undefined,
              payload: message.payload as CryptoPayload,
            }),
          });
          break;
        case "UPSERT_SECRET":
          sendResponse({
            ok: true,
            secret: await upsertSecretEntry({
              uuid: message.uuid ? String(message.uuid) : undefined,
              payload: message.payload as SecretPayload,
            }),
          });
          break;
        case "DELETE_ENTRY":
          await deleteVaultEntry(String(message.uuid ?? ""), {
            kind: message.kind
              ? (String(message.kind) as
                  | "login"
                  | "card"
                  | "crypto"
                  | "secret")
              : undefined,
          });
          sendResponse({ ok: true });
          break;
        case "CHANGE_MASTER_PASSWORD":
          await changeMasterPassword({
            currentPassword: String(message.currentPassword ?? ""),
            newPassword: String(message.newPassword ?? ""),
          });
          sendResponse({ ok: true });
          break;
        case "PUBLISH_IDENTITY_KEYS":
          await publishIdentityKeys();
          sendResponse({ ok: true });
          break;
        case "CREATE_FOLDER":
          sendResponse({
            ok: true,
            folder: await createFolder({
              name: String(message.name ?? ""),
              parentUuid:
                message.parentUuid === undefined
                  ? undefined
                  : (message.parentUuid as string | null),
            }),
          });
          break;
        case "CREATE_ORG":
          sendResponse({
            ok: true,
            org: await createOrganization(String(message.name ?? "")),
          });
          break;
        case "IMPORT_LOGINS":
          sendResponse({
            ok: true,
            ...(await importLogins({
              raw: String(message.raw ?? ""),
              formatHint: message.formatHint
                ? String(message.formatHint)
                : undefined,
            })),
          });
          break;
        case "EXPORT_VAULT":
          sendResponse({
            ok: true,
            ...(await exportVault(
              (message.format as ExportFormat) || "bitwardenJson",
            )),
          });
          break;
        case "LIST_ORG_MEMBERS":
          sendResponse({
            members: await loadOrgMembers(String(message.orgUuid ?? "")),
          });
          break;
        case "INVITE_ORG_MEMBER":
          await inviteToOrganization({
            orgUuid: String(message.orgUuid ?? ""),
            email: String(message.email ?? ""),
            role: message.role ? String(message.role) : "member",
          });
          sendResponse({ ok: true });
          break;
        case "CREATE_ORG_COLLECTION":
          sendResponse({
            ok: true,
            collection: await createOrganizationCollection({
              orgUuid: String(message.orgUuid ?? ""),
              name: String(message.name ?? ""),
            }),
          });
          break;
        case "CREATE_ORG_ENTRY":
          sendResponse({
            ok: true,
            entry: await createOrganizationEntry({
              orgUuid: String(message.orgUuid ?? ""),
              collectionUuid: String(message.collectionUuid ?? ""),
              title: String(message.title ?? ""),
              username: message.username ? String(message.username) : "",
              password: message.password ? String(message.password) : "",
              url: message.url ? String(message.url) : "",
            }),
          });
          break;
        case "DELETE_ORG_ENTRY":
          await deleteOrganizationEntry({
            orgUuid: String(message.orgUuid ?? ""),
            entryUuid: String(message.entryUuid ?? ""),
          });
          sendResponse({ ok: true });
          break;
        case "DELETE_ACCOUNT":
          await deleteAccount(String(message.masterPassword ?? ""));
          sendResponse({ ok: true });
          break;
        case "RENAME_FOLDER":
          await renameFolder({
            uuid: String(message.uuid ?? ""),
            name: String(message.name ?? ""),
          });
          sendResponse({ ok: true });
          break;
        case "DELETE_FOLDER":
          await deleteFolder(String(message.uuid ?? ""));
          sendResponse({ ok: true });
          break;
        case "REMOVE_ORG_MEMBER":
          await removeMemberFromOrg({
            orgUuid: String(message.orgUuid ?? ""),
            memberId: String(message.memberId ?? ""),
          });
          sendResponse({ ok: true });
          break;
        case "LEAVE_ORG":
          await leaveOrg(String(message.orgUuid ?? ""));
          sendResponse({ ok: true });
          break;
        case "MOVE_LOGIN":
          await moveLoginToFolder({
            uuid: String(message.uuid ?? ""),
            collectionUuid:
              message.collectionUuid === undefined
                ? null
                : (message.collectionUuid as string | null),
          });
          sendResponse({ ok: true });
          break;
        case "GENERATE_PASSWORD": {
          const settings = await getSettings();
          const fromMsg = (message.options ?? {}) as Partial<PasswordGenOptions>;
          const opts: GeneratePasswordOpts = {
            ...DEFAULT_PASSWORD_GEN,
            ...settings.passwordGen,
            ...fromMsg,
            ...(message.length != null ? { length: Number(message.length) } : {}),
          };
          sendResponse({ password: generatePassword(opts), options: opts });
          break;
        }
        case "GET_SETTINGS":
          sendResponse({ settings: await getSettings() });
          break;
        case "CAPTURED_LOGIN":
          sendResponse(
            await decideCapture({
              username: String(message.username ?? ""),
              password: String(message.password ?? ""),
              url: String(message.url ?? sender.tab?.url ?? ""),
            }),
          );
          break;
        case "SAVE_LOGIN":
          await saveLogin({
            username: String(message.username ?? ""),
            password: String(message.password ?? ""),
            url: String(message.url ?? sender.tab?.url ?? ""),
            title: message.title ? String(message.title) : undefined,
          });
          sendResponse({ ok: true });
          break;
        case "UPDATE_LOGIN":
          await updateLogin({
            uuid: String(message.uuid ?? ""),
            username: String(message.username ?? ""),
            password: String(message.password ?? ""),
            url: String(message.url ?? sender.tab?.url ?? ""),
            title: message.title ? String(message.title) : undefined,
          });
          sendResponse({ ok: true });
          break;
        case "PASSKEY_PREPARE_CREATE":
          sendResponse(
            await preparePasskeyCreate(
              String(message.origin ?? sender.tab?.url ?? ""),
              message.publicKey,
            ),
          );
          break;
        case "PASSKEY_PREPARE_GET":
          sendResponse(
            await preparePasskeyGet(
              String(message.origin ?? sender.tab?.url ?? ""),
              message.publicKey,
            ),
          );
          break;
        case "PASSKEY_CREATE":
          sendResponse(
            await performPasskeyCreate(
              String(message.origin ?? sender.tab?.url ?? ""),
              message.publicKey,
            ),
          );
          break;
        case "PASSKEY_GET":
          sendResponse(
            await performPasskeyGet(
              String(message.origin ?? sender.tab?.url ?? ""),
              message.publicKey,
              String(message.uuid ?? ""),
            ),
          );
          break;
        default:
          sendResponse({ ok: false, error: "Unknown message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  })();
  return true;
});
