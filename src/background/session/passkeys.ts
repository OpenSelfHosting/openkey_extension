/**
 * WebAuthn passkey prepare / create / assert flows.
 */
import { nativeRequest, type NativeLoginPayload } from "../../native/bridge";
import type { PasskeyPayload } from "../../shared/types";
import { fillUsername } from "../../shared/types";
import {
  assertPasskeyCredential,
  createPasskeyCredential,
  passkeyAllowed,
  passkeyExcluded,
  resolveRpId,
  rpIdMatches,
  type SerializedPublicKeyCredential,
} from "../../passkey/webauthn";
import { parseCreateOptions, parseGetOptions } from "../../passkey/options";
import { titleFromUrl, urlsFor } from "./mapping";
import { isUnlocked } from "./auth";
import {
  decryptLocalEntries,
  entriesForOrigin,
} from "./vault_read";
import {
  createStandaloneEntryFull,
  preferNativeWrite,
  updateStandaloneEntryFull,
} from "./vault_write";
import { getSession } from "./state";

export type PasskeyPrepareCreateResult =
  | {
      ok: true;
      rpId: string;
      userName: string;
      displayName: string;
    }
  | { ok: false; fallback?: boolean; error?: string };

export type PasskeyPrepareGetResult =
  | {
      ok: true;
      rpId: string;
      candidates: Array<{
        uuid: string;
        title: string;
        userName?: string;
        displayName?: string;
        credentialId: string;
        rpId: string;
      }>;
    }
  | { ok: false; fallback?: boolean; error?: string };

export async function preparePasskeyCreate(
  origin: string,
  publicKeyRaw: unknown,
): Promise<PasskeyPrepareCreateResult> {
  if (!(await isUnlocked())) {
    return { ok: false, fallback: true, error: "Vault locked" };
  }
  try {
    const options = parseCreateOptions(publicKeyRaw);
    if (options.authenticatorSelection?.authenticatorAttachment === "platform") {
      return { ok: false, fallback: true };
    }
    const rpId = resolveRpId(options.rp.id, origin);
    return {
      ok: true,
      rpId,
      userName: options.user.name,
      displayName: options.user.displayName,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function preparePasskeyGet(
  origin: string,
  publicKeyRaw: unknown,
): Promise<PasskeyPrepareGetResult> {
  if (!(await isUnlocked())) {
    return { ok: false, fallback: true, error: "Vault locked" };
  }
  try {
    const options = parseGetOptions(publicKeyRaw);
    const all = await decryptLocalEntries();
    const candidates = all
      .filter((e) => {
        if (!e.passkey?.privateKeyCipher) return false;
        if (!rpIdMatches(e.passkey.rpId, origin)) return false;
        if (options.rpId) {
          try {
            resolveRpId(options.rpId, origin);
          } catch {
            return false;
          }
          if (
            e.passkey.rpId !== options.rpId &&
            !e.passkey.rpId.endsWith(options.rpId) &&
            options.rpId !== e.passkey.rpId
          ) {
            // allow if stored rpId matches origin rules already checked
            if (e.passkey.rpId !== options.rpId) {
              const host = new URL(origin).hostname;
              if (e.passkey.rpId !== host && !host.endsWith(`.${e.passkey.rpId}`)) {
                return false;
              }
            }
          }
        }
        return passkeyAllowed(e.passkey, options.allowCredentials);
      })
      .map((e) => ({
        uuid: e.uuid,
        title: e.title,
        userName: e.passkey?.userName || e.username,
        displayName: e.passkey?.displayName,
        credentialId: e.passkey!.credentialId,
        rpId: e.passkey!.rpId,
      }));
    if (!candidates.length) {
      return { ok: false, fallback: true, error: "No matching passkey" };
    }
    const rpId =
      options.rpId ||
      candidates[0]!.rpId ||
      new URL(origin).hostname;
    return { ok: true, rpId, candidates };
  } catch (e) {
    return {
      ok: false,
      fallback: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function savePasskeyEntry(input: {
  origin: string;
  passkey: PasskeyPayload;
}): Promise<string> {
  const title = input.passkey.rpId || titleFromUrl(input.origin);
  const username = input.passkey.userName || input.passkey.displayName || "";
  const entry: NativeLoginPayload = {
    title,
    username,
    password: "",
    urls: urlsFor(input.origin),
    passkey: input.passkey,
  };

  // Prefer attaching to an existing login for same origin + username
  const matches = await entriesForOrigin(input.origin);
  const want = username.trim().toLowerCase();
  const existing = matches.find((e) => {
    if (!want) return !e.passkey;
    const u = fillUsername(e).trim().toLowerCase();
    return u === want;
  });

  if (existing) {
    const merged: NativeLoginPayload = {
      title: existing.title || title,
      username: existing.username || username,
      password: existing.password,
      urls: existing.urls.length ? existing.urls : entry.urls,
      passkey: input.passkey,
      notes: existing.notes,
    };
    if (await preferNativeWrite()) {
      const res = await nativeRequest(
        { type: "updateEntry", uuid: existing.uuid, entry: merged },
        8000,
      );
      if (!res.ok) throw new Error(res.error || "Native update failed");
      return existing.uuid;
    }
    await updateStandaloneEntryFull(existing.uuid, merged);
    return existing.uuid;
  }

  if (await preferNativeWrite()) {
    const res = await nativeRequest({ type: "createEntry", entry }, 8000);
    if (!res.ok) throw new Error(res.error || "Native create failed");
    if (res.ok && "entry" in res && res.entry) return res.entry.uuid;
    return crypto.randomUUID();
  }

  if (!(await isUnlocked())) {
    throw new Error("Unlock OpenKey first");
  }
  const session = await getSession();
  if (session.mode === "native") {
    throw new Error("Desktop app locked");
  }
  return createStandaloneEntryFull(entry);
}


export async function performPasskeyCreate(
  origin: string,
  publicKeyRaw: unknown,
): Promise<
  | { ok: true; credential: SerializedPublicKeyCredential }
  | { ok: false; error: string; name?: string }
> {
  try {
    if (!(await isUnlocked())) {
      return { ok: false, error: "Vault locked", name: "NotAllowedError" };
    }
    const options = parseCreateOptions(publicKeyRaw);
    const all = await decryptLocalEntries();
    for (const e of all) {
      if (
        e.passkey &&
        rpIdMatches(e.passkey.rpId, origin) &&
        passkeyExcluded(e.passkey, options.excludeCredentials)
      ) {
        return {
          ok: false,
          error: "Credential already registered",
          name: "InvalidStateError",
        };
      }
    }

    const { credential, passkey } = await createPasskeyCredential({
      options,
      origin,
    });
    await savePasskeyEntry({ origin, passkey });
    return { ok: true, credential };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      name: "NotAllowedError",
    };
  }
}

export async function performPasskeyGet(
  origin: string,
  publicKeyRaw: unknown,
  uuid: string,
): Promise<
  | { ok: true; credential: SerializedPublicKeyCredential }
  | { ok: false; error: string; name?: string }
> {
  try {
    if (!(await isUnlocked())) {
      return { ok: false, error: "Vault locked", name: "NotAllowedError" };
    }
    const options = parseGetOptions(publicKeyRaw);
    const all = await decryptLocalEntries();
    const entry = all.find((e) => e.uuid === uuid);
    if (!entry?.passkey?.privateKeyCipher) {
      return { ok: false, error: "Passkey not found", name: "NotAllowedError" };
    }
    const { credential, nextSignCount } = await assertPasskeyCredential({
      passkey: entry.passkey,
      options,
      origin,
    });

    const updatedPasskey: PasskeyPayload = {
      ...entry.passkey,
      signCount: nextSignCount,
    };

    if (await preferNativeWrite()) {
      await nativeRequest(
        { type: "updatePasskeySignCount", uuid, signCount: nextSignCount },
        8000,
      );
    } else {
      const session = await getSession();
      if (session.mode !== "native") {
        await updateStandaloneEntryFull(uuid, {
          title: entry.title,
          username: entry.username,
          password: entry.password,
          urls: entry.urls,
          notes: entry.notes,
          passkey: updatedPasskey,
        });
      }
    }

    return { ok: true, credential };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      name: "NotAllowedError",
    };
  }
}

