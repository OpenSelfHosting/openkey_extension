import { describe, expect, it } from "vitest";
import {
  decryptString,
  deriveAuthHash,
  deriveMasterKey,
  encryptString,
  generateSalt,
  generateVaultKey,
  generateX25519KeyPair,
  openSealedBox,
  sealForPublicKey,
  unwrapVaultKey,
  wrapVaultKey,
} from "./crypto";

describe("crypto", () => {
  it("encrypt/decrypt string round trip", () => {
    const key = generateVaultKey();
    const cipher = encryptString(key, "hello vault");
    expect(decryptString(key, cipher)).toBe("hello vault");
  });

  it("wrap/unwrap vault key", async () => {
    const salt = generateSalt();
    const master = await deriveMasterKey("user@example.com", "correct horse", salt);
    const vault = generateVaultKey();
    const wrapped = await wrapVaultKey(master, vault);
    const unwrapped = await unwrapVaultKey(master, wrapped);
    expect(Array.from(unwrapped)).toEqual(Array.from(vault));
  });

  it("auth hash is deterministic", async () => {
    const salt = generateSalt();
    const master = await deriveMasterKey("user@example.com", "pw", salt);
    expect(deriveAuthHash(master)).toBe(deriveAuthHash(master));
  });

  it("normalizes email for KDF", async () => {
    const salt = generateSalt();
    const a = await deriveMasterKey("User@Example.com", "pw", salt);
    const b = await deriveMasterKey("user@example.com", "pw", salt);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("X25519 sealed box round trip", () => {
    const recipient = generateX25519KeyPair();
    const sealed = sealForPublicKey(recipient.publicKeyB64, new TextEncoder().encode("secret"));
    const opened = openSealedBox(recipient.privateKey, sealed);
    expect(new TextDecoder().decode(opened)).toBe("secret");
  });
});
