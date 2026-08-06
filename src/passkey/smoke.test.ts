/**
 * Smoke test: create + assert ES256 passkey round-trip.
 * Run: npx --yes tsx src/passkey/smoke.test.ts
 */
import {
  assertPasskeyCredential,
  createPasskeyCredential,
} from "./webauthn";
import { toB64Url } from "./encoding";

async function main() {
  const origin = "https://example.com";
  const challenge = toB64Url(crypto.getRandomValues(new Uint8Array(32)));
  const userId = toB64Url(crypto.getRandomValues(new Uint8Array(16)));

  const { credential: created, passkey } = await createPasskeyCredential({
    origin,
    options: {
      rp: { id: "example.com", name: "Example" },
      user: { id: userId, name: "ada@example.com", displayName: "Ada" },
      challenge,
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    },
  });

  if (!created.response.attestationObject) throw new Error("missing attestation");
  if (!passkey.privateKeyCipher) throw new Error("missing private key");
  if (passkey.rpId !== "example.com") throw new Error("bad rpId");

  const getChallenge = toB64Url(crypto.getRandomValues(new Uint8Array(32)));
  const { credential: asserted, nextSignCount } = await assertPasskeyCredential({
    passkey,
    origin,
    options: {
      challenge: getChallenge,
      rpId: "example.com",
      allowCredentials: [{ type: "public-key", id: passkey.credentialId }],
    },
  });

  if (!asserted.response.signature) throw new Error("missing signature");
  if (!asserted.response.authenticatorData) throw new Error("missing authData");
  if (nextSignCount !== 1) throw new Error(`bad signCount ${nextSignCount}`);

  console.log("passkey smoke ok", {
    credentialId: passkey.credentialId.slice(0, 12) + "…",
    signCount: nextSignCount,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
