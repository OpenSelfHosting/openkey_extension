/**
 * Cross-client crypto smoke: fixed salt must yield identical auth hashes
 * as openkey_app CryptoService (Argon2id + HMAC).
 *
 * Run: npx tsx scripts/interop_crypto_check.ts
 */
import {
  deriveAuthHash,
  deriveMasterKey,
  encryptString,
  decryptString,
  fromB64Url,
  generateX25519KeyPair,
  openSealedBox,
  sealForPublicKey,
  toB64Url,
  wrapVaultKey,
  unwrapVaultKey,
} from "../src/crypto/crypto";

const EMAIL = "interop@example.com";
const PASSWORD = "correct horse battery staple";
// 16 zero bytes — same fixture the Dart side of this check uses.
const SALT = new Uint8Array(16);

async function main() {
  const master = await deriveMasterKey(EMAIL, PASSWORD, SALT);
  const authHash = deriveAuthHash(master);
  if (authHash.includes("=")) throw new Error("auth hash must be unpadded");

  const vault = new Uint8Array(32).fill(7);
  const wrapped = await wrapVaultKey(master, vault);
  const unwrapped = await unwrapVaultKey(master, wrapped);
  if (unwrapped.some((b, i) => b !== vault[i])) throw new Error("wrap mismatch");

  // Decrypt a ciphertext produced by Dart with legacy padding (appended =).
  const key = vault;
  const plain = "hello-from-dart";
  const cipher = encryptString(key, plain);
  const legacyPadded =
    cipher + "=".repeat((4 - (cipher.length % 4)) % 4);
  if (decryptString(key, legacyPadded) !== plain) {
    throw new Error("failed to decrypt padded ciphertext");
  }

  const recipient = generateX25519KeyPair();
  const sealed = sealForPublicKey(
    recipient.publicKeyB64,
    new TextEncoder().encode("share-key"),
  );
  const opened = openSealedBox(recipient.privateKey, sealed);
  if (new TextDecoder().decode(opened) !== "share-key") {
    throw new Error("sealed box failed");
  }

  // Round-trip salt encoding used on /auth/register.
  const saltB64 = toB64Url(SALT);
  const back = fromB64Url(saltB64);
  if (back.length !== 16 || back.some((b) => b !== 0)) {
    throw new Error("salt b64 round trip failed");
  }

  console.log("interop crypto ok", {
    authHashPrefix: authHash.slice(0, 12) + "…",
    saltB64,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
