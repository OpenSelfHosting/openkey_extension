import {
  decryptBytes,
  encryptBytes,
  generateX25519KeyPair,
  openSealedBox,
  sealForPublicKey,
} from "../crypto/crypto";
import { fetchVaultMaterial, patchIdentityKeys } from "./api";
import type { Settings } from "../shared/types";

let cachedPrivate: Uint8Array | null = null;

export function clearIdentityCache(): void {
  cachedPrivate = null;
}

/** Ensure X25519 identity keys exist (for shares/orgs). Returns private key bytes. */
export async function ensureIdentityKeys(
  settings: Settings,
  vaultKey: Uint8Array,
): Promise<Uint8Array> {
  if (cachedPrivate) return cachedPrivate;

  const me = await fetchVaultMaterial(settings);
  const pub = me.public_key;
  const wrapped = me.encrypted_private_key;

  if (pub && wrapped) {
    cachedPrivate = decryptBytes(vaultKey, wrapped);
    return cachedPrivate;
  }

  const pair = generateX25519KeyPair();
  const wrappedPrivate = encryptBytes(vaultKey, pair.privateKey);
  await patchIdentityKeys(settings, pair.publicKeyB64, wrappedPrivate);
  cachedPrivate = pair.privateKey;
  return cachedPrivate;
}

export async function openSealedForSelf(
  settings: Settings,
  vaultKey: Uint8Array,
  sealedB64: string,
): Promise<Uint8Array> {
  const priv = await ensureIdentityKeys(settings, vaultKey);
  return openSealedBox(priv, sealedB64);
}

export { sealForPublicKey };
