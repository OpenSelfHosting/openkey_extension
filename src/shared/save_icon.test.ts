import { describe, expect, it } from "vitest";
import {
  bytesToBase64,
  encodeFaviconPngKey,
  faviconCandidateUrls,
  isPngMagic,
  persistableBrandIcon,
  shouldReplaceStoredIcon,
} from "./save_icon";

describe("persistableBrandIcon", () => {
  it("stores a catalog brand from the website URL", () => {
    expect(
      persistableBrandIcon({
        title: "GitHub",
        urls: ["https://github.com/login"],
      }),
    ).toBe("brands/github.svg");
  });

  it("returns null when the site is not in the brand catalog", () => {
    expect(
      persistableBrandIcon({
        title: "npm",
        urls: ["https://www.npmjs.com/login"],
      }),
    ).toBeNull();
  });
});

describe("faviconCandidateUrls", () => {
  it("prefers the page icon then png / Google / ico", () => {
    const urls = faviconCandidateUrls({
      pageUrl: "https://www.npmjs.com/login",
      pageIconUrl: "https://static.npmjs.com/favicon.png",
    });
    expect(urls[0]).toBe("https://static.npmjs.com/favicon.png");
    expect(urls).toContain("https://www.npmjs.com/favicon.png");
    expect(urls.some((u) => u.includes("google.com/s2/favicons"))).toBe(true);
    expect(urls).toContain("https://www.npmjs.com/favicon.ico");
  });

  it("skips localhost", () => {
    expect(
      faviconCandidateUrls({ pageUrl: "http://localhost:3000" }),
    ).toEqual([]);
  });
});

describe("favicon png key", () => {
  it("encodes custom:favicon:png like the app", () => {
    expect(encodeFaviconPngKey("QUJD")).toBe("custom:favicon:png:QUJD");
    expect(bytesToBase64(new Uint8Array([0x89, 0x50]))).toBe("iVA=");
  });

  it("detects PNG magic", () => {
    expect(isPngMagic(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe(
      true,
    );
    expect(isPngMagic(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });
});

describe("shouldReplaceStoredIcon", () => {
  it("upgrades empty and generic keys only", () => {
    expect(shouldReplaceStoredIcon(undefined)).toBe(true);
    expect(shouldReplaceStoredIcon("material:key")).toBe(true);
    expect(shouldReplaceStoredIcon("brands/github.svg")).toBe(false);
    expect(shouldReplaceStoredIcon("material:lock")).toBe(false);
  });
});
