/**
 * Item shares and organization management.
 */
import {
  decryptBytes,
  decryptString,
  encryptBytes,
  encryptString,
  generateVaultKey,
} from "../../crypto/crypto";
import {
  getSettings,
  upsertEntries,
} from "../../db/store";
import {
  acceptInvite,
  acceptShare,
  createOrg,
  createOrgCollectionApi,
  createOrgEntryApi,
  createShare,
  deleteOrgEntryApi,
  inviteOrgMember,
  leaveOrganization,
  listOrgMembers,
  listOrgs,
  listOrgCollections,
  listOrgEntries,
  listPendingInvites,
  listShares,
  lookupPublicKey,
  removeOrgMember,
  revokeShare,
  syncPushEntries,
  type InviteRecord,
  type OrgMemberRecord,
  type ShareRecord,
} from "../../sync/api";
import {
  ensureIdentityKeys,
  openSealedForSelf,
  sealForPublicKey,
} from "../../sync/identity";
import type { StoredEntry } from "../../shared/types";
import { ReservedCollections } from "../../shared/types";
import { isUnlocked } from "./auth";
import { applySyncResult } from "./sync";
import { decryptLocalItems } from "./vault_read";
import { upsertLoginEntry } from "./vault_write";
import { getSession, vaultKeyFromSession } from "./state";

export async function loadShares(): Promise<ShareRecord[]> {
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  return listShares(settings);
}

export async function acceptIncomingShare(share: ShareRecord): Promise<void> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Accept shares in standalone mode or the desktop app");
  }
  if (!share.wrapped_item_key || !share.encrypted_payload) {
    throw new Error("Share is incomplete");
  }
  const settings = await getSettings();
  const key = await vaultKeyFromSession();
  await ensureIdentityKeys(settings, key);
  const itemKey = await openSealedForSelf(
    settings,
    key,
    share.wrapped_item_key,
  );
  const payloadJson = decryptString(itemKey, share.encrypted_payload);
  const payload = JSON.parse(payloadJson) as Record<string, unknown>;
  const type = payload.type?.toString();
  const uuid = crypto.randomUUID();
  let collectionUuid: string | null = null;
  if (type === "card") collectionUuid = ReservedCollections.wallets;
  if (type === "crypto") collectionUuid = ReservedCollections.crypto;
  if (type === "secret") collectionUuid = ReservedCollections.secrets;

  const stored: StoredEntry = {
    uuid,
    collectionUuid,
    encryptedPayload: encryptString(key, JSON.stringify(payload)),
    revision: 1,
    isDeleted: false,
    updatedAt: new Date().toISOString(),
    isSynced: false,
  };
  await upsertEntries([stored]);
  await acceptShare(settings, share.uuid);
  if (settings.accessToken) {
    const pulled = await syncPushEntries(settings, [stored]);
    await applySyncResult(pulled, { entryUuids: [stored.uuid] });
  }
}

export async function revokeOutgoingShare(uuid: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  await revokeShare(settings, uuid);
}

export async function shareEntryWithEmail(input: {
  entryUuid: string;
  recipientEmail: string;
}): Promise<void> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Share from standalone mode or the desktop app");
  }
  const settings = await getSettings();
  const key = await vaultKeyFromSession();
  const items = await decryptLocalItems();
  const item = items.find((e) => e.uuid === input.entryUuid);
  if (!item) throw new Error("Entry not found");

  await ensureIdentityKeys(settings, key);
  const lookup = await lookupPublicKey(settings, input.recipientEmail);
  if (!lookup.public_key) throw new Error("Recipient has no identity key yet");

  const itemKey = generateVaultKey();
  const payload: Record<string, unknown> = { ...item };
  delete payload.kind;
  delete payload.uuid;
  delete payload.collectionUuid;
  delete payload.revision;
  const encryptedPayload = encryptString(itemKey, JSON.stringify(payload));
  const wrappedItemKey = sealForPublicKey(lookup.public_key, itemKey);
  await createShare(settings, {
    uuid: crypto.randomUUID(),
    recipient_email: lookup.email,
    ...(lookup.user_id ? { recipient_user_id: lookup.user_id } : {}),
    entry_uuid: item.uuid,
    wrapped_item_key: wrappedItemKey,
    encrypted_payload: encryptedPayload,
  });
}

// ── Orgs ─────────────────────────────────────────────────────────────────────

export type OrgSummary = {
  uuid: string;
  name: string;
  role: string;
  collections: Array<{ uuid: string; name: string }>;
  entries: Array<{
    uuid: string;
    collectionUuid: string | null;
    title: string;
    username: string;
  }>;
  /** Vault-key-wrapped org key — needed for invite / org collections. */
  wrappedOrgKey?: string | null;
};

export async function loadOrgs(): Promise<OrgSummary[]> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("View orgs in standalone mode or the desktop app");
  }
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  const key = await vaultKeyFromSession();
  await ensureIdentityKeys(settings, key);

  const orgs = await listOrgs(settings);
  const out: OrgSummary[] = [];
  for (const org of orgs) {
    const wrapped = org.membership?.wrapped_org_key;
    let name = "Organization";
    let orgKey: Uint8Array | null = null;
    if (wrapped) {
      try {
        // Active memberships store org key wrapped with the member vault key.
        orgKey = decryptBytes(key, wrapped);
        name = decryptString(orgKey, org.encrypted_name);
      } catch {
        try {
          // Pending invite path may still be a sealed box.
          orgKey = await openSealedForSelf(settings, key, wrapped);
          name = decryptString(orgKey, org.encrypted_name);
        } catch {
          name = "Organization";
        }
      }
    }
    let collections: Array<{ uuid: string; name: string }> = [];
    try {
      const cols = await listOrgCollections(settings, org.uuid);
      collections = cols.map((c) => {
        let cname = "Collection";
        if (orgKey) {
          try {
            cname = decryptString(orgKey, c.encrypted_name);
          } catch {
            /* keep */
          }
        }
        return { uuid: c.uuid, name: cname };
      });
    } catch {
      collections = [];
    }
    const entries: OrgSummary["entries"] = [];
    try {
      const rows = await listOrgEntries(settings, org.uuid);
      for (const row of rows) {
        let title = row.uuid.slice(0, 8);
        let username = "";
        if (orgKey && row.encrypted_payload) {
          try {
            const payload = JSON.parse(
              decryptString(orgKey, row.encrypted_payload),
            ) as Record<string, unknown>;
            title = String(payload.title ?? payload.name ?? title);
            username = String(payload.username ?? "");
          } catch {
            /* keep */
          }
        }
        entries.push({
          uuid: row.uuid,
          collectionUuid: row.collection_uuid,
          title,
          username,
        });
      }
    } catch {
      /* ignore */
    }
    out.push({
      uuid: org.uuid,
      name,
      role: org.membership?.role ?? "member",
      collections,
      entries,
      wrappedOrgKey: wrapped ?? null,
    });
  }
  return out;
}

async function unwrapOrgKeyFor(
  org: OrgSummary,
  vaultKey: Uint8Array,
  settings: Awaited<ReturnType<typeof getSettings>>,
): Promise<Uint8Array> {
  const wrapped = org.wrappedOrgKey;
  if (!wrapped) throw new Error("Missing org key");
  try {
    return decryptBytes(vaultKey, wrapped);
  } catch {
    return openSealedForSelf(settings, vaultKey, wrapped);
  }
}

export async function loadOrgMembers(
  orgUuid: string,
): Promise<OrgMemberRecord[]> {
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  return listOrgMembers(settings, orgUuid);
}

export async function inviteToOrganization(input: {
  orgUuid: string;
  email: string;
  role?: string;
}): Promise<void> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  const key = await vaultKeyFromSession();
  await ensureIdentityKeys(settings, key);
  const orgs = await loadOrgs();
  const org = orgs.find((o) => o.uuid === input.orgUuid);
  if (!org) throw new Error("Organization not found");
  const orgKey = await unwrapOrgKeyFor(org, key, settings);
  const lookup = await lookupPublicKey(
    settings,
    input.email.trim().toLowerCase(),
  );
  if (!lookup.public_key) throw new Error("Recipient has no identity key yet");
  const sealed = sealForPublicKey(lookup.public_key, orgKey);
  await inviteOrgMember(settings, input.orgUuid, {
    email: input.email.trim().toLowerCase(),
    role: input.role === "admin" ? "admin" : "member",
    wrapped_org_key: sealed,
  });
}

export async function createOrganizationCollection(input: {
  orgUuid: string;
  name: string;
}): Promise<{ uuid: string; name: string }> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  const key = await vaultKeyFromSession();
  const orgs = await loadOrgs();
  const org = orgs.find((o) => o.uuid === input.orgUuid);
  if (!org) throw new Error("Organization not found");
  const orgKey = await unwrapOrgKeyFor(org, key, settings);
  const name = input.name.trim();
  if (!name) throw new Error("Name required");
  const created = await createOrgCollectionApi(settings, input.orgUuid, {
    uuid: crypto.randomUUID(),
    encrypted_name: encryptString(orgKey, name),
  });
  return { uuid: created.uuid, name };
}

export async function createOrganizationEntry(input: {
  orgUuid: string;
  collectionUuid: string;
  title: string;
  username?: string;
  password?: string;
  url?: string;
}): Promise<{ uuid: string; title: string; username: string }> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  const key = await vaultKeyFromSession();
  const orgs = await loadOrgs();
  const org = orgs.find((o) => o.uuid === input.orgUuid);
  if (!org) throw new Error("Organization not found");
  const orgKey = await unwrapOrgKeyFor(org, key, settings);
  const title = input.title.trim();
  if (!title) throw new Error("Title required");
  const username = (input.username ?? "").trim();
  const payload = {
    type: "login",
    title,
    username,
    password: input.password ?? "",
    urls: input.url?.trim() ? [input.url.trim()] : [],
    notes: "",
  };
  const created = await createOrgEntryApi(settings, input.orgUuid, {
    uuid: crypto.randomUUID(),
    collection_uuid: input.collectionUuid,
    encrypted_payload: encryptString(orgKey, JSON.stringify(payload)),
  });
  return { uuid: created.uuid, title, username };
}

export async function deleteOrganizationEntry(input: {
  orgUuid: string;
  entryUuid: string;
}): Promise<void> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  await deleteOrgEntryApi(settings, input.orgUuid, input.entryUuid);
}

export async function removeMemberFromOrg(input: {
  orgUuid: string;
  memberId: string;
}): Promise<void> {
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  await removeOrgMember(settings, input.orgUuid, input.memberId);
}

export async function leaveOrg(orgUuid: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  await leaveOrganization(settings, orgUuid);
}


export async function loadPendingInvites(): Promise<
  Array<InviteRecord & { displayName?: string }>
> {
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  return listPendingInvites(settings);
}

export async function acceptPendingInvite(inviteId: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  await acceptInvite(settings, inviteId);
}


export async function createOrganization(name: string): Promise<OrgSummary> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Create organizations in the OpenKey desktop app");
  }
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in");
  const key = await vaultKeyFromSession();
  await ensureIdentityKeys(settings, key);
  const orgKey = generateVaultKey();
  const encryptedName = encryptString(orgKey, name.trim());
  const wrappedOrgKey = encryptBytes(key, orgKey);
  const created = await createOrg(settings, {
    uuid: crypto.randomUUID(),
    encrypted_name: encryptedName,
    wrapped_org_key: wrappedOrgKey,
  });
  return {
    uuid: created.uuid,
    name: name.trim(),
    role: "owner",
    collections: [],
    entries: [],
  };
}

