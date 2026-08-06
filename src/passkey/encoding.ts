/** Base64url + minimal CBOR helpers for WebAuthn. */

export function toB64Url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64Url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Encode a non-negative integer as CBOR. */
function cborUint(n: number): Uint8Array {
  if (n < 24) return new Uint8Array([n]);
  if (n < 256) return new Uint8Array([0x18, n]);
  if (n < 65536) return new Uint8Array([0x19, (n >> 8) & 0xff, n & 0xff]);
  return new Uint8Array([
    0x1a,
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ]);
}

function cborNint(n: number): Uint8Array {
  // CBOR negative integer: -1 - n encoded with major type 1
  const v = -1 - n;
  if (v < 24) return new Uint8Array([0x20 | v]);
  if (v < 256) return new Uint8Array([0x38, v]);
  if (v < 65536) return new Uint8Array([0x39, (v >> 8) & 0xff, v & 0xff]);
  return new Uint8Array([
    0x3a,
    (v >>> 24) & 0xff,
    (v >>> 16) & 0xff,
    (v >>> 8) & 0xff,
    v & 0xff,
  ]);
}

function cborInt(n: number): Uint8Array {
  return n >= 0 ? cborUint(n) : cborNint(n);
}

function cborBytes(data: Uint8Array): Uint8Array {
  const header =
    data.length < 24
      ? new Uint8Array([0x40 | data.length])
      : data.length < 256
        ? new Uint8Array([0x58, data.length])
        : new Uint8Array([0x59, (data.length >> 8) & 0xff, data.length & 0xff]);
  return concatBytes(header, data);
}

function cborText(s: string): Uint8Array {
  const enc = new TextEncoder().encode(s);
  const header =
    enc.length < 24
      ? new Uint8Array([0x60 | enc.length])
      : enc.length < 256
        ? new Uint8Array([0x78, enc.length])
        : new Uint8Array([0x79, (enc.length >> 8) & 0xff, enc.length & 0xff]);
  return concatBytes(header, enc);
}

function cborMap(entries: Array<[number | string, Uint8Array]>): Uint8Array {
  const header =
    entries.length < 24
      ? new Uint8Array([0xa0 | entries.length])
      : new Uint8Array([0xb8, entries.length]);
  const parts: Uint8Array[] = [header];
  for (const [k, v] of entries) {
    parts.push(typeof k === "number" ? cborInt(k) : cborText(k));
    parts.push(v);
  }
  return concatBytes(...parts);
}

/** COSE_Key for P-256 public key (ES256). */
export function encodeCoseEs256PublicKey(x: Uint8Array, y: Uint8Array): Uint8Array {
  return cborMap([
    [1, cborInt(2)], // kty: EC2
    [3, cborInt(-7)], // alg: ES256
    [-1, cborInt(1)], // crv: P-256
    [-2, cborBytes(x)],
    [-3, cborBytes(y)],
  ]);
}

/** Attestation object with fmt "none". */
export function encodeNoneAttestationObject(authData: Uint8Array): Uint8Array {
  return cborMap([
    ["fmt", cborText("none")],
    ["attStmt", cborMap([])],
    ["authData", cborBytes(authData)],
  ]);
}

/** Convert IEEE P1363 ECDSA signature (r||s) to ASN.1 DER. */
export function p1363ToDer(sig: Uint8Array): Uint8Array {
  if (sig.length !== 64) throw new Error("Expected 64-byte P-256 signature");
  const r = sig.slice(0, 32);
  const s = sig.slice(32);

  const encInt = (raw: Uint8Array): Uint8Array => {
    let i = 0;
    while (i < raw.length - 1 && raw[i] === 0) i++;
    const trimmed = raw.subarray(i);
    const needsPad = (trimmed[0]! & 0x80) !== 0;
    const body = needsPad
      ? concatBytes(new Uint8Array([0]), trimmed)
      : new Uint8Array(trimmed);
    return concatBytes(new Uint8Array([0x02, body.length]), body);
  };

  const rDer = encInt(r);
  const sDer = encInt(s);
  const seq = concatBytes(rDer, sDer);
  return concatBytes(new Uint8Array([0x30, seq.length]), seq);
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", data.slice());
  return new Uint8Array(digest);
}
