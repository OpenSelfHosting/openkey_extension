/** Shared crypto matching openkey_app CryptoService (Argon2id + AES-GCM + X25519). */

import { argon2id } from "hash-wasm";
import { gcm } from "@noble/ciphers/aes";
import { x25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";

/** Sealed-box version byte: ephemeral X25519 pubkey + AES-GCM. */
export const SEALED_BOX_VERSION = 0x01;

const enc = new TextEncoder();

export const KDF = {
  memory: 65536,
  iterations: 3,
  parallelism: 4,
  hashLength: 32,
} as const;

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function generateSalt(length = 16): Uint8Array {
  return randomBytes(length);
}

export function generateVaultKey(): Uint8Array {
  return randomBytes(32);
}

export async function deriveMasterKey(
  email: string,
  masterPassword: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const password = enc.encode(`${email.trim().toLowerCase()}:${masterPassword}`);
  const hash = await argon2id({
    password,
    salt,
    parallelism: KDF.parallelism,
    iterations: KDF.iterations,
    memorySize: KDF.memory,
    hashLength: KDF.hashLength,
    outputType: "binary",
  });
  return hash as Uint8Array;
}

export function deriveAuthHash(masterKey: Uint8Array): string {
  const digest = hmac(sha256, masterKey, enc.encode("openkey-auth"));
  return toB64Url(digest);
}

export function deriveDbKey(vaultKey: Uint8Array): Uint8Array {
  return hmac(sha256, vaultKey, enc.encode("openkey-db"));
}

export function encryptBytes(key: Uint8Array, plaintext: Uint8Array): string {
  const nonce = randomBytes(12);
  const aes = gcm(key, nonce);
  const ciphertext = aes.encrypt(plaintext);
  // noble gcm appends 16-byte tag to ciphertext
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  return toB64Url(combined);
}

export function decryptBytes(key: Uint8Array, ciphertextB64: string): Uint8Array {
  const combined = fromB64Url(ciphertextB64);
  if (combined.length < 28) throw new Error("Ciphertext too short");
  const nonce = combined.slice(0, 12);
  const data = combined.slice(12);
  const aes = gcm(key, nonce);
  return aes.decrypt(data);
}

export function encryptString(key: Uint8Array, plaintext: string): string {
  return encryptBytes(key, enc.encode(plaintext));
}

export function decryptString(key: Uint8Array, ciphertext: string): string {
  return new TextDecoder().decode(decryptBytes(key, ciphertext));
}

export async function wrapVaultKey(
  masterKey: Uint8Array,
  vaultKey: Uint8Array,
): Promise<string> {
  return encryptBytes(masterKey, vaultKey);
}

export async function unwrapVaultKey(
  masterKey: Uint8Array,
  wrapped: string,
): Promise<Uint8Array> {
  return decryptBytes(masterKey, wrapped);
}

const PW_LOWER = "abcdefghijklmnopqrstuvwxyz";
const PW_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PW_DIGITS = "0123456789";
const PW_SYMBOLS = "!@#$%^&*()-_=+[]{}|;:,.<>?";
const PW_AMBIGUOUS = new Set("Il1O0o");

export type GeneratePasswordOpts = {
  length?: number;
  upper?: boolean;
  lower?: boolean;
  digits?: boolean;
  symbols?: boolean;
  avoidAmbiguous?: boolean;
};

/** Match openkey_app CryptoService.generatePassword options. */
export function generatePassword(opts: GeneratePasswordOpts | number = 20): string {
  const o =
    typeof opts === "number"
      ? { length: opts }
      : opts;
  const length = Math.max(4, Math.min(64, o.length ?? 20));
  const avoid = !!o.avoidAmbiguous;
  const filter = (alphabet: string) =>
    avoid
      ? [...alphabet].filter((c) => !PW_AMBIGUOUS.has(c)).join("")
      : alphabet;

  const sets = [
    o.lower !== false ? filter(PW_LOWER) : "",
    o.upper !== false ? filter(PW_UPPER) : "",
    o.digits !== false ? filter(PW_DIGITS) : "",
    o.symbols !== false ? filter(PW_SYMBOLS) : "",
  ].filter((s) => s.length > 0);

  if (!sets.length || length < sets.length) {
    throw new Error("Invalid password generation options");
  }

  const pool = sets.join("");
  const chars: string[] = sets.map(
    (set) => set[randomBytes(1)[0]! % set.length]!,
  );
  const fill = randomBytes(length - sets.length);
  for (let i = 0; i < fill.length; i++) {
    chars.push(pool[fill[i]! % pool.length]!);
  }
  // Fisher–Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

export type X25519KeyPair = {
  publicKeyB64: string;
  privateKey: Uint8Array;
};

export function generateX25519KeyPair(): X25519KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKeyB64: toB64Url(publicKey), privateKey };
}

function deriveSealedAesKey(sharedSecret: Uint8Array): Uint8Array {
  return sha256(new Uint8Array([...enc.encode("openkey-seal-v1"), ...sharedSecret]));
}

/** Seal plaintext for recipient X25519 public key (base64url). */
export function sealForPublicKey(
  recipientPublicKeyB64: string,
  plaintext: Uint8Array,
): string {
  const recipient = fromB64Url(recipientPublicKeyB64);
  if (recipient.length !== 32) throw new Error("Invalid X25519 public key length");
  const ephPriv = x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(ephPriv);
  const shared = x25519.getSharedSecret(ephPriv, recipient);
  const aesKey = deriveSealedAesKey(shared);
  const nonce = randomBytes(12);
  const aes = gcm(aesKey, nonce);
  const ciphertext = aes.encrypt(plaintext);
  const combined = new Uint8Array(1 + 32 + 12 + ciphertext.length);
  combined[0] = SEALED_BOX_VERSION;
  combined.set(ephPub, 1);
  combined.set(nonce, 33);
  combined.set(ciphertext, 45);
  return toB64Url(combined);
}

/** Open a sealed box created by [sealForPublicKey]. */
export function openSealedBox(
  identityPrivateKey: Uint8Array,
  sealedB64: string,
): Uint8Array {
  const combined = fromB64Url(sealedB64);
  if (combined.length < 62) throw new Error("Sealed box too short");
  if (combined[0] !== SEALED_BOX_VERSION) {
    throw new Error("Unsupported sealed box version");
  }
  const ephPub = combined.slice(1, 33);
  const nonce = combined.slice(33, 45);
  const data = combined.slice(45);
  const shared = x25519.getSharedSecret(identityPrivateKey, ephPub);
  const aesKey = deriveSealedAesKey(shared);
  const aes = gcm(aesKey, nonce);
  return aes.decrypt(data);
}

export { toB64Url, fromB64Url };
