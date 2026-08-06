/** Deserialize publicKey options sent from the page script (ArrayBuffers as __openkey_bin). */

import { fromB64Url, toB64Url } from "./encoding";
import type { CreatePublicKeyOptions, GetPublicKeyOptions } from "./webauthn";

type Wire =
  | null
  | boolean
  | number
  | string
  | Wire[]
  | { [k: string]: Wire }
  | { __openkey_bin: string };

function isBin(v: unknown): v is { __openkey_bin: string } {
  return !!v && typeof v === "object" && "__openkey_bin" in (v as object);
}

function walk(value: Wire): unknown {
  if (value == null) return value;
  if (isBin(value)) return toB64Url(fromB64Url(value.__openkey_bin));
  if (Array.isArray(value)) return value.map((v) => walk(v as Wire));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v as Wire);
    return out;
  }
  return value;
}

function asB64Id(id: unknown): string {
  if (typeof id === "string") {
    // Already base64url from walk, or legacy
    return id.includes("__") ? id : id;
  }
  return String(id ?? "");
}

export function parseCreateOptions(raw: unknown): CreatePublicKeyOptions {
  const o = walk(raw as Wire) as Record<string, unknown>;
  const rp = (o.rp ?? {}) as Record<string, unknown>;
  const user = (o.user ?? {}) as Record<string, unknown>;
  const exclude = (o.excludeCredentials as Array<Record<string, unknown>> | undefined)?.map(
    (c) => ({
      type: String(c.type ?? "public-key"),
      id: asB64Id(c.id),
    }),
  );
  return {
    rp: {
      id: rp.id != null ? String(rp.id) : undefined,
      name: String(rp.name ?? ""),
    },
    user: {
      id: asB64Id(user.id),
      name: String(user.name ?? ""),
      displayName: String(user.displayName ?? user.name ?? ""),
    },
    challenge: asB64Id(o.challenge),
    pubKeyCredParams: (o.pubKeyCredParams as Array<{ type: string; alg: number }>) ?? [
      { type: "public-key", alg: -7 },
    ],
    excludeCredentials: exclude,
    authenticatorSelection: o.authenticatorSelection as CreatePublicKeyOptions["authenticatorSelection"],
    attestation: o.attestation != null ? String(o.attestation) : undefined,
    timeout: typeof o.timeout === "number" ? o.timeout : undefined,
    extensions: o.extensions as Record<string, unknown> | undefined,
  };
}

export function parseGetOptions(raw: unknown): GetPublicKeyOptions {
  const o = walk(raw as Wire) as Record<string, unknown>;
  const allow = (o.allowCredentials as Array<Record<string, unknown>> | undefined)?.map(
    (c) => ({
      type: String(c.type ?? "public-key"),
      id: asB64Id(c.id),
    }),
  );
  return {
    challenge: asB64Id(o.challenge),
    rpId: o.rpId != null ? String(o.rpId) : undefined,
    allowCredentials: allow,
    userVerification: o.userVerification != null ? String(o.userVerification) : undefined,
    timeout: typeof o.timeout === "number" ? o.timeout : undefined,
    extensions: o.extensions as Record<string, unknown> | undefined,
  };
}
