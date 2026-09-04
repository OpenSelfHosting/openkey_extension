/**
 * Lock / unlock / register / account key rotation.
 */
import {
  deriveAuthHash,
  deriveMasterKey,
  fromB64Url,
  generateSalt,
  generateVaultKey,
  KDF,
  toB64Url,
  unwrapVaultKey,
  wrapVaultKey,
} from "../../crypto/crypto";
import {
  getSettings,
  getVaultMeta,
  saveSettings,
  saveVaultMeta,
  upsertAttachments,
  upsertCollections,
  upsertEntries,
} from "../../db/store";
import { nativeRequest } from "../../native/bridge";
import {
  deleteServerAccount,
  fetchVaultMaterial,
  login,
  prelogin,
  register,
  rekey,
  syncPull,
} from "../../sync/api";
import { sessionLooksUnlocked } from "../../shared/types";
import { clearIdentityCache, ensureIdentityKeys } from "../../sync/identity";
import {
  getSession,
  scheduleAutoLock,
  setSession,
  vaultKeyFromSession,
} from "./state";

export async function lock(): Promise<void> {
  clearIdentityCache();
  await setSession({ unlocked: false });
}

export async function isUnlocked(): Promise<boolean> {
  return sessionLooksUnlocked(await getSession());
}


export async function unlockStandalone(
  email: string,
  masterPassword: string,
  serverUrl?: string,
): Promise<void> {
  if (serverUrl?.trim()) {
    await saveSettings({
      serverUrl: serverUrl.trim().replace(/\/$/, ""),
    });
  }
  const settings = await getSettings();
  let meta = await getVaultMeta();
  const normalizedEmail = email.trim().toLowerCase();

  // Prefer local meta (offline / after first unlock). Otherwise recover from
  // an existing token via /auth/me, or bootstrap salt via /auth/prelogin.
  if (!meta && settings.accessToken) {
    try {
      const material = await fetchVaultMaterial(settings);
      meta = {
        email: material.email,
        saltB64: material.salt,
        wrappedVaultKey: material.encrypted_vault_key,
        kdfParams: material.kdf_params,
      };
      await saveVaultMeta(meta);
    } catch {
      /* fall through to prelogin */
    }
  }

  if (!meta) {
    if (!settings.serverUrl?.trim()) {
      throw new Error(
        "Set your self-hosted Server URL, then unlock with email and master password.",
      );
    }
    try {
      const bootstrap = await prelogin(settings, normalizedEmail);
      meta = {
        email: normalizedEmail,
        saltB64: bootstrap.salt,
        // Wrapped key arrives after login via /auth/me.
        wrappedVaultKey: "",
        kdfParams: bootstrap.kdf_params,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        msg.includes("Unknown") || msg.includes("404")
          ? "No account found for this email on the server. Create an account first."
          : `Could not reach server for prelogin: ${msg}`,
      );
    }
  }

  const saltB64 = meta.saltB64;
  const kdfParams = meta.kdfParams;
  const salt = fromB64Url(saltB64);
  const masterKey = await deriveMasterKey(normalizedEmail, masterPassword, salt);
  const authHash = deriveAuthHash(masterKey);

  let wrapped = meta.wrappedVaultKey;
  let vaultKey: Uint8Array | null = null;

  if (wrapped) {
    try {
      vaultKey = await unwrapVaultKey(masterKey, wrapped);
    } catch {
      throw new Error("Invalid master password");
    }
  }

  try {
    const token = await login(settings, normalizedEmail, authHash);
    await saveSettings({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
    });
    const nextSettings = await getSettings();

    const material = await fetchVaultMaterial(nextSettings);
    wrapped = material.encrypted_vault_key;
    await saveVaultMeta({
      email: material.email,
      saltB64: material.salt,
      wrappedVaultKey: material.encrypted_vault_key,
      kdfParams: material.kdf_params,
    });

    try {
      vaultKey = await unwrapVaultKey(masterKey, wrapped);
    } catch {
      throw new Error("Invalid master password");
    }

    const pulled = await syncPull(nextSettings);
    await upsertEntries(pulled.entries);
    await upsertCollections(pulled.collections);
    await upsertAttachments(pulled.attachments);
  } catch (err) {
    // Offline unlock still works when we already have a local wrapped key.
    if (!vaultKey || !wrapped) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "Invalid master password") throw err;
      throw new Error(
        msg.includes("auth_hash") ||
          msg.includes("401") ||
          msg.includes("Invalid")
          ? "Invalid master password"
          : msg,
      );
    }
  }

  if (!vaultKey || !wrapped) {
    throw new Error("Could not unlock vault");
  }

  await saveVaultMeta({
    email: normalizedEmail,
    saltB64,
    wrappedVaultKey: wrapped,
    kdfParams,
  });

  await setSession({
    unlocked: true,
    email: normalizedEmail,
    authHash,
    vaultKeyB64: toB64Url(vaultKey),
    wrappedVaultKey: wrapped,
    saltB64,
    kdfParams,
    mode: "standalone",
  });

  scheduleAutoLock();
}

/** Create a new vault account on the self-hosted server, then unlock. */
export async function registerStandalone(
  email: string,
  masterPassword: string,
  serverUrl?: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    throw new Error("Enter a valid email");
  }
  if (masterPassword.length < 12) {
    throw new Error("Master password must be at least 12 characters");
  }

  if (serverUrl?.trim()) {
    await saveSettings({
      serverUrl: serverUrl.trim().replace(/\/$/, ""),
    });
  }
  const settings = await getSettings();
  if (!settings.serverUrl?.trim()) {
    throw new Error(
      "Enter your self-hosted Server URL to create an account.",
    );
  }

  const salt = generateSalt();
  const saltB64 = toB64Url(salt);
  const kdfParams = {
    algorithm: "argon2id",
    memory: KDF.memory,
    iterations: KDF.iterations,
    parallelism: KDF.parallelism,
    hashLength: KDF.hashLength,
  };
  const masterKey = await deriveMasterKey(
    normalizedEmail,
    masterPassword,
    salt,
  );
  const authHash = deriveAuthHash(masterKey);
  const vaultKey = generateVaultKey();
  const wrapped = await wrapVaultKey(masterKey, vaultKey);

  const token = await register(settings, {
    email: normalizedEmail,
    auth_hash: authHash,
    encrypted_vault_key: wrapped,
    kdf_params: kdfParams,
    salt: saltB64,
  });

  await saveSettings({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
  });
  await saveVaultMeta({
    email: normalizedEmail,
    saltB64,
    wrappedVaultKey: wrapped,
    kdfParams,
  });
  await setSession({
    unlocked: true,
    email: normalizedEmail,
    authHash,
    vaultKeyB64: toB64Url(vaultKey),
    wrappedVaultKey: wrapped,
    saltB64,
    kdfParams,
    mode: "standalone",
  });
  scheduleAutoLock();

  try {
    const next = await getSettings();
    const pulled = await syncPull(next);
    await upsertEntries(pulled.entries);
    await upsertCollections(pulled.collections);
    await upsertAttachments(pulled.attachments);
  } catch {
    /* empty vault is fine */
  }
}

export async function linkVaultMeta(input: {
  email: string;
  saltB64: string;
  wrappedVaultKey: string;
  kdfParams?: Record<string, unknown>;
}): Promise<void> {
  await saveVaultMeta({
    email: input.email.trim().toLowerCase(),
    saltB64: input.saltB64,
    wrappedVaultKey: input.wrappedVaultKey,
    kdfParams: input.kdfParams ?? {
      algorithm: "argon2id",
      memory: 65536,
      iterations: 3,
      parallelism: 4,
      hashLength: 32,
    },
  });
}

export async function unlockViaNative(): Promise<{ ok: boolean; error?: string }> {
  // Explicit "Use desktop app" always attempts the bridge.
  // preferNativeBridge only controls automatic write preference while standalone.
  const res = await nativeRequest({ type: "ping" });
  if (!res.ok) {
    const err = "error" in res ? res.error : "Native host unavailable";
    const hint =
      err.includes("Specified native messaging host not found") ||
      err.includes("not found") ||
      err.includes("Access")
        ? `${err}. In the OpenKey app: Settings → Browser extension — paste this extension’s ID and tap Connect.`
        : err;
    return { ok: false, error: hint };
  }
  if (!("unlocked" in res) || res.unlocked !== true) {
    return {
      ok: false,
      error: "Desktop app is locked — unlock OpenKey, then try again.",
    };
  }
  await setSession({ unlocked: true, mode: "native" });
  scheduleAutoLock();
  return { ok: true };
}


export async function deleteAccount(masterPassword: string): Promise<void> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Delete account from the OpenKey desktop app");
  }
  const meta = await getVaultMeta();
  if (!meta?.email || !meta.saltB64 || !meta.wrappedVaultKey) {
    throw new Error("Vault metadata missing");
  }
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not connected to a server");
  const salt = fromB64Url(meta.saltB64);
  const master = await deriveMasterKey(meta.email, masterPassword, salt);
  try {
    await unwrapVaultKey(master, meta.wrappedVaultKey);
  } catch {
    throw new Error("Master password is incorrect");
  }
  const authHash = await deriveAuthHash(master);
  await deleteServerAccount(settings, authHash);
  await saveSettings({
    accessToken: undefined,
    refreshToken: undefined,
  });
}


export async function changeMasterPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Change master password in the OpenKey desktop app");
  }
  const meta = await getVaultMeta();
  if (!meta?.email || !meta.saltB64 || !meta.wrappedVaultKey) {
    throw new Error("Vault metadata missing");
  }
  if (input.newPassword.length < 12) {
    throw new Error("New password must be at least 12 characters");
  }
  if (input.newPassword === input.currentPassword) {
    throw new Error("New password must be different");
  }

  const salt = fromB64Url(meta.saltB64);
  const currentMaster = await deriveMasterKey(
    meta.email,
    input.currentPassword,
    salt,
  );
  try {
    await unwrapVaultKey(currentMaster, meta.wrappedVaultKey);
  } catch {
    throw new Error("Current master password is incorrect");
  }

  const vaultKey = await vaultKeyFromSession();
  const newMaster = await deriveMasterKey(meta.email, input.newPassword, salt);
  const currentAuthHash = await deriveAuthHash(currentMaster);
  const newAuthHash = await deriveAuthHash(newMaster);
  const newWrapped = await wrapVaultKey(newMaster, vaultKey);

  const settings = await getSettings();
  if (settings.accessToken) {
    await rekey(settings, {
      current_auth_hash: currentAuthHash,
      auth_hash: newAuthHash,
      encrypted_vault_key: newWrapped,
      salt: meta.saltB64,
      kdf_params: meta.kdfParams,
    });
  }

  await saveVaultMeta({
    email: meta.email,
    saltB64: meta.saltB64,
    wrappedVaultKey: newWrapped,
    kdfParams: meta.kdfParams,
  });
  await setSession({
    ...session,
    authHash: newAuthHash,
    wrappedVaultKey: newWrapped,
  });
}

export async function publishIdentityKeys(): Promise<void> {
  if (!(await isUnlocked())) throw new Error("Vault locked");
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Publish keys from standalone mode or the desktop app");
  }
  const settings = await getSettings();
  if (!settings.accessToken) throw new Error("Not logged in to a server");
  const key = await vaultKeyFromSession();
  await ensureIdentityKeys(settings, key);
}


chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "auto-lock") void lock();
});
