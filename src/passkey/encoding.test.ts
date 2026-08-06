import { describe, expect, it } from "vitest";
import {
  concatBytes,
  fromB64Url,
  p1363ToDer,
  toB64Url,
} from "./encoding";

describe("encoding", () => {
  it("base64url round trip", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(Array.from(fromB64Url(toB64Url(bytes)))).toEqual(Array.from(bytes));
  });

  it("concatBytes joins parts", () => {
    const out = concatBytes(new Uint8Array([1, 2]), new Uint8Array([3]));
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it("p1363ToDer encodes a 64-byte signature", () => {
    const sig = new Uint8Array(64);
    sig[0] = 0x80; // force leading zero pad on r
    sig[32] = 0x01;
    const der = p1363ToDer(sig);
    expect(der[0]).toBe(0x30);
    expect(der.length).toBeGreaterThan(64);
  });

  it("p1363ToDer rejects wrong length", () => {
    expect(() => p1363ToDer(new Uint8Array(32))).toThrow(/64-byte/);
  });
});
