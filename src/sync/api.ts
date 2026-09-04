import type {
  Settings,
  StoredAttachment,
  StoredCollection,
  StoredEntry,
} from "../shared/types";
import { normalizeFolderId } from "../shared/vault_scope";
import {
  getServerRevision,
  saveSettings,
  setServerRevision,
} from "../db/store";

type TokenPair = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  expires_in?: number;
};

type JsonValue = Record<string, unknown> | unknown[] | null;

async function rawRequest(
  settings: Settings,
  method: string,
  path: string,
  body?: unknown,
  auth = false,
): Promise<{ ok: boolean; status: number; data: JsonValue }> {
  const root = settings.serverUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth && settings.accessToken) {
    headers.Authorization = `Bearer ${settings.accessToken}`;
  }
  const res = await fetch(`${root}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) {
    return { ok: res.ok, status: res.status, data: {} };
  }
  const text = await res.text();
  let data: JsonValue = {};
  if (text) {
    try {
      data = JSON.parse(text) as JsonValue;
    } catch {
      data = { detail: text };
    }
  }
  return { ok: res.ok, status: res.status, data };
}

async function tryRefresh(settings: Settings): Promise<Settings | null> {
  if (!settings.refreshToken) return null;
  const { ok, data } = await rawRequest(settings, "POST", "/auth/refresh", {
    refresh_token: settings.refreshToken,
  });
  if (!ok || !data || Array.isArray(data)) return null;
  const next = await saveSettings({
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
  });
  return next;
}

async function request(
  settings: Settings,
  method: string,
  path: string,
  body?: unknown,
  auth = false,
): Promise<JsonValue> {
  let current = settings;
  let result = await rawRequest(current, method, path, body, auth);
  if (auth && result.status === 401) {
    const refreshed = await tryRefresh(current);
    if (refreshed) {
      current = refreshed;
      result = await rawRequest(current, method, path, body, auth);
    }
  }
  if (!result.ok) {
    const detailObj = result.data;
    const detail =
      (!Array.isArray(detailObj) && detailObj
        ? (detailObj.detail as string) || (detailObj.message as string)
        : null) || `HTTP ${result.status}`;
    throw new Error(typeof detail === "string" ? detail : `HTTP ${result.status}`);
  }
  return result.data;
}

function asRecord(data: JsonValue): Record<string, unknown> {
  if (data && !Array.isArray(data)) return data;
  return {};
}

function asList(data: JsonValue): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && Array.isArray((data as Record<string, unknown>).items)) {
    return (data as Record<string, unknown>).items as Record<string, unknown>[];
  }
  return [];
}

function tokenPairFrom(data: Record<string, unknown>): TokenPair {
  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string,
    user_id: String(data.user_id),
    expires_in:
      typeof data.expires_in === "number" ? data.expires_in : undefined,
  };
}

export async function login(
  settings: Settings,
  email: string,
  authHash: string,
): Promise<TokenPair> {
  const data = asRecord(
    await request(settings, "POST", "/auth/login", {
      email,
      auth_hash: authHash,
    }),
  );
  return tokenPairFrom(data);
}

/** Public KDF bootstrap so unlock can derive auth_hash without a paste step. */
export async function prelogin(
  settings: Settings,
  email: string,
): Promise<{ salt: string; kdf_params: Record<string, unknown> }> {
  const data = asRecord(
    await request(settings, "POST", "/auth/prelogin", { email }),
  );
  return {
    salt: data.salt as string,
    kdf_params: (data.kdf_params as Record<string, unknown>) ?? {},
  };
}

export async function register(
  settings: Settings,
  body: {
    email: string;
    auth_hash: string;
    encrypted_vault_key: string;
    kdf_params: Record<string, unknown>;
    salt: string;
  },
): Promise<TokenPair> {
  const data = asRecord(await request(settings, "POST", "/auth/register", body));
  return tokenPairFrom(data);
}

export type MeResponse = {
  salt: string;
  encrypted_vault_key: string;
  kdf_params: Record<string, unknown>;
  email: string;
  public_key?: string | null;
  encrypted_private_key?: string | null;
};

/** Vault unlock bootstrap from authenticated /auth/me (ciphertext only). */
export async function fetchVaultMaterial(settings: Settings): Promise<MeResponse> {
  const data = asRecord(await request(settings, "GET", "/auth/me", undefined, true));
  return {
    salt: data.salt as string,
    encrypted_vault_key: data.encrypted_vault_key as string,
    kdf_params: (data.kdf_params as Record<string, unknown>) ?? {},
    email: data.email as string,
    public_key: (data.public_key as string) ?? null,
    encrypted_private_key: (data.encrypted_private_key as string) ?? null,
  };
}

export async function patchIdentityKeys(
  settings: Settings,
  publicKey: string,
  encryptedPrivateKey: string,
): Promise<void> {
  await request(
    settings,
    "PATCH",
    "/auth/me/keys",
    {
      public_key: publicKey,
      encrypted_private_key: encryptedPrivateKey,
    },
    true,
  );
}

export async function lookupPublicKey(
  settings: Settings,
  email: string,
): Promise<{ user_id: string; email: string; public_key: string }> {
  const data = asRecord(
    await request(
      settings,
      "POST",
      "/auth/lookup-public-key",
      { email },
      true,
    ),
  );
  return {
    user_id: String(data.user_id ?? ""),
    email: String(data.email ?? email),
    public_key: String(data.public_key ?? ""),
  };
}

function mapEntry(e: Record<string, unknown>): StoredEntry {
  return {
    uuid: e.uuid as string,
    collectionUuid: normalizeFolderId(e.collection_uuid as string | null),
    encryptedPayload: e.encrypted_payload as string,
    revision: (e.revision as number) ?? 1,
    isDeleted: (e.is_deleted as boolean) ?? false,
    updatedAt: (e.updated_at as string) ?? new Date().toISOString(),
    isSynced: true,
  };
}

function mapCollection(c: Record<string, unknown>): StoredCollection {
  return {
    uuid: c.uuid as string,
    encryptedName: c.encrypted_name as string,
    icon: (c.icon as string) ?? "material:folder",
    color: (c.color as number) ?? null,
    parentUuid: normalizeFolderId(c.parent_uuid as string | null),
    sortOrder: (c.sort_order as number) ?? 0,
    revision: (c.revision as number) ?? 1,
    isDeleted: (c.is_deleted as boolean) ?? false,
    updatedAt: (c.updated_at as string) ?? new Date().toISOString(),
    isSynced: true,
  };
}

function mapAttachment(a: Record<string, unknown>): StoredAttachment {
  return {
    uuid: a.uuid as string,
    entryUuid: a.entry_uuid as string,
    filename: (a.filename as string) ?? "attachment",
    sizeBytes: (a.size_bytes as number) ?? 0,
    contentType: (a.content_type as string) ?? null,
    revision: (a.revision as number) ?? 1,
    isDeleted: (a.is_deleted as boolean) ?? false,
    encryptedBlob: (a.encrypted_blob as string) ?? "",
    updatedAt: (a.updated_at as string) ?? new Date().toISOString(),
  };
}

export async function syncPull(settings: Settings): Promise<{
  entries: StoredEntry[];
  collections: StoredCollection[];
  attachments: StoredAttachment[];
}> {
  return syncWith(settings, { collections: [], entries: [] });
}

/** Push local ciphertext changes and pull server state. */
export async function syncWith(
  settings: Settings,
  push: {
    collections?: Array<{
      uuid: string;
      encrypted_name: string;
      icon?: string;
      color?: number | null;
      parent_uuid?: string | null;
      sort_order?: number;
      revision: number;
      is_deleted: boolean;
    }>;
    entries?: Array<{
      uuid: string;
      collection_uuid: string | null;
      encrypted_payload: string;
      revision: number;
      is_deleted: boolean;
    }>;
  },
): Promise<{
  entries: StoredEntry[];
  collections: StoredCollection[];
  attachments: StoredAttachment[];
}> {
  const sinceRevision = await getServerRevision();
  const data = asRecord(
    await request(
      settings,
      "POST",
      "/sync",
      {
        since_revision: sinceRevision,
        collections: push.collections ?? [],
        entries: push.entries ?? [],
      },
      true,
    ),
  );
  const entries = ((data.entries as Record<string, unknown>[]) ?? []).map(
    mapEntry,
  );
  const collections = (
    (data.collections as Record<string, unknown>[]) ?? []
  ).map(mapCollection);
  const attachments = (
    (data.attachments as Record<string, unknown>[]) ?? []
  ).map(mapAttachment);
  const serverRevision = data.server_revision;
  if (typeof serverRevision === "number" && serverRevision >= 0) {
    await setServerRevision(serverRevision);
  }
  return { entries, collections, attachments };
}

export async function syncPushEntries(
  settings: Settings,
  entries: StoredEntry[],
): Promise<{
  entries: StoredEntry[];
  collections: StoredCollection[];
  attachments: StoredAttachment[];
}> {
  return syncWith(settings, {
    entries: entries.map((e) => ({
      uuid: e.uuid,
      collection_uuid: e.collectionUuid,
      encrypted_payload: e.encryptedPayload,
      revision: e.revision,
      is_deleted: e.isDeleted,
    })),
  });
}

export async function syncPushLocal(
  settings: Settings,
  push: {
    entries?: StoredEntry[];
    collections?: StoredCollection[];
  },
): Promise<{
  entries: StoredEntry[];
  collections: StoredCollection[];
  attachments: StoredAttachment[];
}> {
  return syncWith(settings, {
    entries: (push.entries ?? []).map((e) => ({
      uuid: e.uuid,
      collection_uuid: e.collectionUuid,
      encrypted_payload: e.encryptedPayload,
      revision: e.revision,
      is_deleted: e.isDeleted,
    })),
    collections: (push.collections ?? []).map((c) => ({
      uuid: c.uuid,
      encrypted_name: c.encryptedName,
      icon: c.icon,
      color: c.color,
      parent_uuid: c.parentUuid,
      sort_order: c.sortOrder,
      revision: c.revision,
      is_deleted: c.isDeleted,
    })),
  });
}

/** Download attachment ciphertext bytes (multipart content endpoint). */
export async function downloadAttachmentBlob(
  settings: Settings,
  uuid: string,
): Promise<Uint8Array> {
  let current = settings;
  const root = current.serverUrl.replace(/\/$/, "");
  const doFetch = async (s: Settings) => {
    const headers: Record<string, string> = { Accept: "application/octet-stream" };
    if (s.accessToken) headers.Authorization = `Bearer ${s.accessToken}`;
    return fetch(`${root}/attachments/${uuid}/content`, { headers });
  };
  let res = await doFetch(current);
  if (res.status === 401) {
    const refreshed = await tryRefresh(current);
    if (refreshed) {
      current = refreshed;
      res = await doFetch(current);
    }
  }
  if (!res.ok) {
    throw new Error(`Attachment download failed (${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export type ShareRecord = {
  uuid: string;
  owner_user_id: string;
  recipient_user_id?: string | null;
  recipient_email?: string | null;
  entry_uuid?: string | null;
  collection_uuid?: string | null;
  wrapped_item_key: string;
  encrypted_payload?: string | null;
  status: string;
  revision: number;
};

export async function listShares(settings: Settings): Promise<ShareRecord[]> {
  const data = await request(settings, "GET", "/shares", undefined, true);
  return asList(data).map((s) => ({
    uuid: String(s.uuid),
    owner_user_id: String(s.owner_user_id),
    recipient_user_id: s.recipient_user_id ? String(s.recipient_user_id) : null,
    recipient_email: (s.recipient_email as string) ?? null,
    entry_uuid: (s.entry_uuid as string) ?? null,
    collection_uuid: (s.collection_uuid as string) ?? null,
    wrapped_item_key: String(s.wrapped_item_key ?? ""),
    encrypted_payload: (s.encrypted_payload as string) ?? null,
    status: String(s.status ?? "pending"),
    revision: (s.revision as number) ?? 1,
  }));
}

export async function acceptShare(settings: Settings, uuid: string): Promise<void> {
  await request(settings, "POST", `/shares/${uuid}/accept`, {}, true);
}

export async function revokeShare(settings: Settings, uuid: string): Promise<void> {
  await request(settings, "POST", `/shares/${uuid}/revoke`, {}, true);
}

export async function createShare(
  settings: Settings,
  body: Record<string, unknown>,
): Promise<void> {
  await request(settings, "POST", "/shares", body, true);
}

export type OrgRecord = {
  uuid: string;
  encrypted_name: string;
  owner_user_id: string;
  revision: number;
  membership?: {
    role: string;
    wrapped_org_key: string;
    status: string;
  } | null;
};

export async function listOrgs(settings: Settings): Promise<OrgRecord[]> {
  const data = await request(settings, "GET", "/orgs", undefined, true);
  return asList(data).map((o) => {
    const membership = o.membership as Record<string, unknown> | undefined;
    return {
      uuid: String(o.uuid),
      encrypted_name: String(o.encrypted_name ?? ""),
      owner_user_id: String(o.owner_user_id),
      revision: (o.revision as number) ?? 1,
      membership: membership
        ? {
            role: String(membership.role ?? "member"),
            wrapped_org_key: String(membership.wrapped_org_key ?? ""),
            status: String(membership.status ?? "active"),
          }
        : null,
    };
  });
}

export type OrgCollectionRecord = {
  uuid: string;
  encrypted_name: string;
  revision: number;
};

export async function listOrgCollections(
  settings: Settings,
  orgUuid: string,
): Promise<OrgCollectionRecord[]> {
  const data = await request(
    settings,
    "GET",
    `/orgs/${orgUuid}/collections`,
    undefined,
    true,
  );
  return asList(data).map((c) => ({
    uuid: String(c.uuid),
    encrypted_name: String(c.encrypted_name ?? ""),
    revision: (c.revision as number) ?? 1,
  }));
}

export type InviteRecord = {
  id: string;
  org_uuid?: string | null;
  org_encrypted_name?: string | null;
  role: string;
  wrapped_org_key: string;
  status: string;
};

export async function listPendingInvites(
  settings: Settings,
): Promise<InviteRecord[]> {
  const data = await request(settings, "GET", "/invites/pending", undefined, true);
  return asList(data).map((i) => ({
    id: String(i.id),
    org_uuid: (i.org_uuid as string) ?? null,
    org_encrypted_name: (i.org_encrypted_name as string) ?? null,
    role: String(i.role ?? "member"),
    wrapped_org_key: String(i.wrapped_org_key ?? ""),
    status: String(i.status ?? "pending"),
  }));
}

export async function acceptInvite(
  settings: Settings,
  inviteId: string,
  wrappedOrgKey?: string,
): Promise<void> {
  await request(
    settings,
    "POST",
    `/invites/${inviteId}/accept`,
    wrappedOrgKey ? { wrapped_org_key: wrappedOrgKey } : {},
    true,
  );
}

export async function rekey(
  settings: Settings,
  body: {
    current_auth_hash: string;
    auth_hash: string;
    encrypted_vault_key: string;
    salt?: string;
    kdf_params?: Record<string, unknown>;
  },
): Promise<void> {
  await request(settings, "POST", "/auth/rekey", body, true);
}

export async function createOrg(
  settings: Settings,
  body: {
    uuid: string;
    encrypted_name: string;
    wrapped_org_key: string;
    revision?: number;
  },
): Promise<OrgRecord> {
  const data = asRecord(
    await request(settings, "POST", "/orgs", { revision: 1, ...body }, true),
  );
  return {
    uuid: String(data.uuid ?? body.uuid),
    encrypted_name: String(data.encrypted_name ?? body.encrypted_name),
    owner_user_id: String(data.owner_user_id ?? ""),
    revision: (data.revision as number) ?? 1,
    membership: {
      role: "owner",
      wrapped_org_key: body.wrapped_org_key,
      status: "active",
    },
  };
}

export type OrgMemberRecord = {
  id: string;
  role: string;
  status: string;
  invited_email: string | null;
};

export async function listOrgMembers(
  settings: Settings,
  orgUuid: string,
): Promise<OrgMemberRecord[]> {
  const data = await request(
    settings,
    "GET",
    `/orgs/${orgUuid}/members`,
    undefined,
    true,
  );
  return asList(data).map((m) => ({
    id: String(m.id),
    role: String(m.role ?? "member"),
    status: String(m.status ?? "active"),
    invited_email: (m.invited_email as string) ?? null,
  }));
}

export async function inviteOrgMember(
  settings: Settings,
  orgUuid: string,
  body: { email: string; role: string; wrapped_org_key: string },
): Promise<void> {
  await request(settings, "POST", `/orgs/${orgUuid}/invites`, body, true);
}

export async function createOrgCollectionApi(
  settings: Settings,
  orgUuid: string,
  body: { uuid: string; encrypted_name: string; revision?: number },
): Promise<{ uuid: string; encrypted_name: string }> {
  const data = asRecord(
    await request(
      settings,
      "POST",
      `/orgs/${orgUuid}/collections`,
      { revision: 1, ...body },
      true,
    ),
  );
  return {
    uuid: String(data.uuid ?? body.uuid),
    encrypted_name: String(data.encrypted_name ?? body.encrypted_name),
  };
}

export type OrgEntryRecord = {
  uuid: string;
  collection_uuid: string | null;
  encrypted_payload: string;
  revision: number;
};

export async function listOrgEntries(
  settings: Settings,
  orgUuid: string,
): Promise<OrgEntryRecord[]> {
  const data = await request(
    settings,
    "GET",
    `/orgs/${orgUuid}/entries`,
    undefined,
    true,
  );
  return asList(data).map((e) => ({
    uuid: String(e.uuid),
    collection_uuid: (e.collection_uuid as string | null | undefined) ?? null,
    encrypted_payload: String(e.encrypted_payload ?? ""),
    revision: (e.revision as number) ?? 1,
  }));
}

export async function createOrgEntryApi(
  settings: Settings,
  orgUuid: string,
  body: {
    uuid: string;
    collection_uuid?: string | null;
    encrypted_payload: string;
    revision?: number;
  },
): Promise<OrgEntryRecord> {
  const data = asRecord(
    await request(
      settings,
      "POST",
      `/orgs/${orgUuid}/entries`,
      { revision: 1, ...body },
      true,
    ),
  );
  return {
    uuid: String(data.uuid ?? body.uuid),
    collection_uuid:
      (data.collection_uuid as string | null | undefined) ??
      body.collection_uuid ??
      null,
    encrypted_payload: String(
      data.encrypted_payload ?? body.encrypted_payload,
    ),
    revision: (data.revision as number) ?? 1,
  };
}

export async function deleteOrgEntryApi(
  settings: Settings,
  orgUuid: string,
  entryUuid: string,
): Promise<void> {
  await request(
    settings,
    "DELETE",
    `/orgs/${orgUuid}/entries/${entryUuid}`,
    undefined,
    true,
  );
}

export async function deleteServerAccount(
  settings: Settings,
  authHash: string,
): Promise<void> {
  await request(settings, "POST", "/auth/delete", { auth_hash: authHash }, true);
}

export async function removeOrgMember(
  settings: Settings,
  orgUuid: string,
  memberId: string,
): Promise<void> {
  await request(
    settings,
    "DELETE",
    `/orgs/${orgUuid}/members/${memberId}`,
    undefined,
    true,
  );
}

export async function leaveOrganization(
  settings: Settings,
  orgUuid: string,
): Promise<void> {
  await request(settings, "POST", `/orgs/${orgUuid}/leave`, {}, true);
}
