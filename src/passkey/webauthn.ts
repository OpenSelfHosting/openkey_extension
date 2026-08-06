/** Software WebAuthn authenticator (ES256) for OpenKey vault passkeys. */

import type { PasskeyPayload } from "../shared/types";
import {
  concatBytes,
  encodeCoseEs256PublicKey,
  encodeNoneAttestationObject,
  fromB64Url,
  p1363ToDer,
  sha256,
  toB64Url,
} from "./encoding";

export const ES256_ALG = -7;

export type SerializedPublicKeyCredential = {
  id: string;
  rawId: string;
  type: "public-key";
  authenticatorAttachment: "cross-platform";
  clientExtensionResults: Record<string, unknown>;
  response: {
    clientDataJSON: string;
    attestationObject?: string;
    authenticatorData?: string;
    signature?: string;
    userHandle?: string | null;
    publicKey?: string;
    publicKeyAlgorithm?: number;
    transports?: string[];
  };
};

export type CreatePublicKeyOptions = {
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: Array<{ type: string; alg: number }>;
  excludeCredentials?: Array<{ type: string; id: string }>;
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    residentKey?: string;
    requireResidentKey?: boolean;
    userVerification?: string;
  };
  attestation?: string;
  timeout?: number;
  extensions?: Record<string, unknown>;
};

export type GetPublicKeyOptions = {
  challenge: string;
  rpId?: string;
  allowCredentials?: Array<{ type: string; id: string }>;
  userVerification?: string;
  timeout?: number;
  extensions?: Record<string, unknown>;
};

function flagsByte(opts: {
  userPresent?: boolean;
  userVerified?: boolean;
  attested?: boolean;
  backupEligible?: boolean;
  backupState?: boolean;
}): number {
  let f = 0;
  if (opts.userPresent !== false) f |= 0x01; // UP
  if (opts.userVerified !== false) f |= 0x04; // UV
  if (opts.backupEligible) f |= 0x08; // BE
  if (opts.backupState) f |= 0x10; // BS
  if (opts.attested) f |= 0x40; // AT
  return f;
}

function be32(n: number): Uint8Array {
  return new Uint8Array([
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ]);
}

function be16(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}

export function resolveRpId(optionsRpId: string | undefined, origin: string): string {
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    throw new Error("Invalid origin");
  }
  const rpId = (optionsRpId || host).toLowerCase();
  if (rpId === host) return rpId;
  if (host.endsWith(`.${rpId}`)) return rpId;
  throw new Error(`RP ID "${rpId}" is not valid for origin host "${host}"`);
}

export function rpIdMatches(storedRpId: string, origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    const rp = storedRpId.toLowerCase();
    return host === rp || host.endsWith(`.${rp}`);
  } catch {
    return false;
  }
}

async function buildClientDataJSON(input: {
  type: "webauthn.create" | "webauthn.get";
  challenge: string;
  origin: string;
}): Promise<Uint8Array> {
  const json = JSON.stringify({
    type: input.type,
    challenge: input.challenge,
    origin: input.origin,
    crossOrigin: false,
  });
  return new TextEncoder().encode(json);
}

async function generateEs256KeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  privatePkcs8: Uint8Array;
  cosePublicKey: Uint8Array;
}> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  if (!jwk.x || !jwk.y) throw new Error("Missing JWK coordinates");
  const x = fromB64Url(jwk.x);
  const y = fromB64Url(jwk.y);
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    privatePkcs8: pkcs8,
    cosePublicKey: encodeCoseEs256PublicKey(x, y),
  };
}

async function importPrivateKey(pkcs8B64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    fromB64Url(pkcs8B64).slice(),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function signAssertion(
  privateKey: CryptoKey,
  authenticatorData: Uint8Array,
  clientDataJSON: Uint8Array,
): Promise<Uint8Array> {
  const clientHash = await sha256(clientDataJSON);
  const toSign = concatBytes(authenticatorData, clientHash);
  const p1363 = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      toSign.slice(),
    ),
  );
  return p1363ToDer(p1363);
}

export async function createPasskeyCredential(input: {
  options: CreatePublicKeyOptions;
  origin: string;
}): Promise<{ credential: SerializedPublicKeyCredential; passkey: PasskeyPayload }> {
  const { options, origin } = input;
  const algs = options.pubKeyCredParams ?? [];
  if (algs.length && !algs.some((p) => p.alg === ES256_ALG && p.type === "public-key")) {
    throw new Error("OpenKey only supports ES256 (-7)");
  }

  const rpId = resolveRpId(options.rp.id, origin);
  const keys = await generateEs256KeyPair();
  const credentialId = crypto.getRandomValues(new Uint8Array(32));
  const userHandle = fromB64Url(options.user.id);
  const signCount = 0;

  const rpIdHash = await sha256(new TextEncoder().encode(rpId));
  const aaguid = new Uint8Array(16);
  const attested = concatBytes(
    aaguid,
    be16(credentialId.length),
    credentialId,
    keys.cosePublicKey,
  );
  const authenticatorData = concatBytes(
    rpIdHash,
    new Uint8Array([
      flagsByte({
        userPresent: true,
        userVerified: true,
        attested: true,
        backupEligible: true,
        backupState: true,
      }),
    ]),
    be32(signCount),
    attested,
  );

  const clientDataJSON = await buildClientDataJSON({
    type: "webauthn.create",
    challenge: options.challenge,
    origin,
  });
  const attestationObject = encodeNoneAttestationObject(authenticatorData);
  const id = toB64Url(credentialId);

  const passkey: PasskeyPayload = {
    rpId,
    credentialId: id,
    userHandle: toB64Url(userHandle),
    privateKeyCipher: toB64Url(keys.privatePkcs8),
    publicKey: toB64Url(keys.cosePublicKey),
    alg: ES256_ALG,
    signCount,
    userName: options.user.name,
    displayName: options.user.displayName,
  };

  const credential: SerializedPublicKeyCredential = {
    id,
    rawId: id,
    type: "public-key",
    authenticatorAttachment: "cross-platform",
    clientExtensionResults: {},
    response: {
      clientDataJSON: toB64Url(clientDataJSON),
      attestationObject: toB64Url(attestationObject),
      publicKey: toB64Url(keys.cosePublicKey),
      publicKeyAlgorithm: ES256_ALG,
      transports: ["internal", "hybrid"],
    },
  };

  return { credential, passkey };
}

export async function assertPasskeyCredential(input: {
  passkey: PasskeyPayload;
  options: GetPublicKeyOptions;
  origin: string;
}): Promise<{
  credential: SerializedPublicKeyCredential;
  nextSignCount: number;
}> {
  const { passkey, options, origin } = input;
  if (!passkey.privateKeyCipher) {
    throw new Error("Passkey has no private key — metadata only");
  }
  if (!rpIdMatches(passkey.rpId, origin)) {
    throw new Error("Passkey RP ID does not match origin");
  }

  const rpId = options.rpId
    ? resolveRpId(options.rpId, origin)
    : passkey.rpId;
  if (rpId !== passkey.rpId && !passkey.rpId.endsWith(rpId) && rpId !== passkey.rpId) {
    // Stored credential is for passkey.rpId; request may omit or use same effective rpId
    if (passkey.rpId !== rpId && !new URL(origin).hostname.endsWith(passkey.rpId)) {
      /* still ok if stored matches origin */
    }
  }

  const nextSignCount = (passkey.signCount ?? 0) + 1;
  const rpIdHash = await sha256(new TextEncoder().encode(passkey.rpId));
  const authenticatorData = concatBytes(
    rpIdHash,
    new Uint8Array([
      flagsByte({
        userPresent: true,
        userVerified: true,
        attested: false,
        backupEligible: true,
        backupState: true,
      }),
    ]),
    be32(nextSignCount),
  );

  const clientDataJSON = await buildClientDataJSON({
    type: "webauthn.get",
    challenge: options.challenge,
    origin,
  });

  const privateKey = await importPrivateKey(passkey.privateKeyCipher);
  const signature = await signAssertion(privateKey, authenticatorData, clientDataJSON);

  const credential: SerializedPublicKeyCredential = {
    id: passkey.credentialId,
    rawId: passkey.credentialId,
    type: "public-key",
    authenticatorAttachment: "cross-platform",
    clientExtensionResults: {},
    response: {
      clientDataJSON: toB64Url(clientDataJSON),
      authenticatorData: toB64Url(authenticatorData),
      signature: toB64Url(signature),
      userHandle: passkey.userHandle ?? null,
    },
  };

  return { credential, nextSignCount };
}

export function passkeyExcluded(
  passkey: PasskeyPayload | null | undefined,
  excludeCredentials?: Array<{ type: string; id: string }>,
): boolean {
  if (!passkey?.credentialId || !excludeCredentials?.length) return false;
  return excludeCredentials.some((c) => c.id === passkey.credentialId);
}

export function passkeyAllowed(
  passkey: PasskeyPayload,
  allowCredentials?: Array<{ type: string; id: string }>,
): boolean {
  if (!allowCredentials?.length) return true;
  return allowCredentials.some((c) => c.id === passkey.credentialId);
}
