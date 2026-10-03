import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type Manifest = {
  content_security_policy?: { extension_pages?: string };
  background?: { service_worker?: string };
};

function loadManifest(which: "manifest.json" | "dist/manifest.json"): Manifest {
  return JSON.parse(readFileSync(resolve(ROOT, which), "utf8")) as Manifest;
}

/**
 * Argon2id (hash-wasm) derives the master key through WebAssembly, and the
 * service worker is the only place that key is ever produced. MV3's default
 * extension_pages CSP is `script-src 'self'`, which makes
 * `WebAssembly.compile` throw — so REGISTER and every unlock/login failed in a
 * real browser even though the whole Node test suite passed.
 *
 * `'wasm-unsafe-eval'` is the narrow allowance for this: it permits WASM
 * compilation only, not `eval()`.
 */
describe("manifest CSP", () => {
  const cspOf = (m: Manifest) => m.content_security_policy?.extension_pages ?? "";

  it("allows wasm compilation so Argon2id can run in the service worker", () => {
    const csp = cspOf(loadManifest("manifest.json"));
    expect(csp).not.toBe("");
    expect(csp).toContain("'wasm-unsafe-eval'");
  });

  it("keeps script-src otherwise locked to 'self'", () => {
    const csp = cspOf(loadManifest("manifest.json"));
    const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? "";
    const sources = scriptSrc.split(/\s+/).filter(Boolean);
    // 'self' + the wasm carve-out. Nothing else — no 'unsafe-eval', no
    // remote origins, no wildcards.
    expect(sources.sort()).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it("does not allow unsafe-eval or remote script", () => {
    const csp = cspOf(loadManifest("manifest.json"));
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toMatch(/script-src[^;]*https?:/);
  });

  it("survives the build (vite copies the CSP into dist/manifest.json)", () => {
    const dist = loadManifest("dist/manifest.json");
    expect(cspOf(dist)).toContain("'wasm-unsafe-eval'");
  });
});