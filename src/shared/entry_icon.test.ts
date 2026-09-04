import { describe, expect, it } from "vitest";
import {
  MATERIAL_KEY_PATH,
  MATERIAL_PATHS,
  brandFileName,
  customIconDataUrl,
  entryIconHtml,
  pickerVisual,
  resolveEntryIcon,
  siteFaviconUrl,
  suggestBrandKey,
  isGenericMaterialIcon,
} from "./entry_icon";

const assetUrl = (path: string) => `ext://${path}`;

describe("brandFileName", () => {
  it("accepts brands/*.svg and rejects traversal", () => {
    expect(brandFileName("brands/github.svg")).toBe("github.svg");
    expect(brandFileName("brands/../evil.svg")).toBeNull();
    expect(brandFileName("brands/foo/bar.svg")).toBeNull();
    expect(brandFileName("brands/not-svg.png")).toBeNull();
    expect(brandFileName("brand:github")).toBe("github.svg");
  });
});

describe("customIconDataUrl", () => {
  it("wraps png and favicon payloads", () => {
    expect(customIconDataUrl("custom:png:QUJD")).toBe(
      "data:image/png;base64,QUJD",
    );
    expect(customIconDataUrl("custom:favicon:png:QUJD")).toBe(
      "data:image/png;base64,QUJD",
    );
    expect(customIconDataUrl("custom:data:image/png;base64,QUJD")).toBe(
      "data:image/png;base64,QUJD",
    );
    expect(customIconDataUrl("material:key")).toBeNull();
  });
});

describe("isGenericMaterialIcon", () => {
  it("treats empty and default key glyphs as generic", () => {
    expect(isGenericMaterialIcon(undefined)).toBe(true);
    expect(isGenericMaterialIcon("")).toBe(true);
    expect(isGenericMaterialIcon("material:key")).toBe(true);
    expect(isGenericMaterialIcon("key")).toBe(true);
    expect(isGenericMaterialIcon("brands/github.svg")).toBe(false);
    expect(isGenericMaterialIcon("material:lock")).toBe(false);
  });
});

describe("siteFaviconUrl", () => {
  it("keeps www stripped for Google s2 and skips localhost", () => {
    expect(siteFaviconUrl(["https://www.npmjs.com/login"])).toBe(
      "https://www.google.com/s2/favicons?sz=64&domain=npmjs.com",
    );
    expect(siteFaviconUrl(["http://localhost:3000"])).toBeUndefined();
  });
});

describe("resolveEntryIcon", () => {
  it("renders stored brand and custom images", () => {
    expect(
      resolveEntryIcon({ icon: "brands/google.svg" }, { assetUrl }),
    ).toEqual({ kind: "image", src: "ext://brands/google.svg" });
    expect(resolveEntryIcon({ icon: "custom:png:QUJD" })).toEqual({
      kind: "image",
      src: "data:image/png;base64,QUJD",
    });
  });

  it("maps material names onto glyph paths", () => {
    const key = resolveEntryIcon({ icon: "material:key" });
    expect(key.kind).toBe("glyph");
    if (key.kind === "glyph") {
      expect(key.name).toBe("key");
      expect(key.path).toBe(MATERIAL_KEY_PATH);
    }
    const folder = resolveEntryIcon({ icon: "folder" });
    expect(folder.kind).toBe("glyph");
    if (folder.kind === "glyph") expect(folder.name).toBe("folder");
    const lock = resolveEntryIcon({ icon: "material:lock" });
    expect(lock.kind).toBe("glyph");
    if (lock.kind === "glyph") expect(lock.path).toBe(MATERIAL_PATHS.lock);
  });

  it("suggests a brand from the website when icon is empty", () => {
    expect(
      suggestBrandKey({
        title: "GitHub",
        urls: ["https://github.com/login"],
      }),
    ).toBe("brands/github.svg");
    const resolved = resolveEntryIcon(
      { title: "GitHub", urls: ["https://github.com"] },
      { assetUrl },
    );
    expect(resolved).toEqual({
      kind: "image",
      src: "ext://brands/github.svg",
    });
  });

  it("falls back to key or folder when nothing matches", () => {
    const key = resolveEntryIcon({ title: "Untitled" });
    expect(key.kind).toBe("glyph");
    if (key.kind === "glyph") expect(key.name).toBe("key");
    const folder = resolveEntryIcon(
      { title: "Family" },
      { fallback: "folder" },
    );
    expect(folder.kind).toBe("glyph");
    if (folder.kind === "glyph") expect(folder.name).toBe("folder");
  });

  it("keeps a stored generic key in the vault list", () => {
    const kept = resolveEntryIcon(
      { icon: "material:key", urls: ["https://github.com"] },
      { assetUrl },
    );
    expect(kept.kind).toBe("glyph");
  });

  it("suggests a brand over a generic key for in-page autofill", () => {
    expect(
      resolveEntryIcon(
        { icon: "material:key", urls: ["https://github.com/login"] },
        { assetUrl, preferSiteArtwork: true },
      ),
    ).toEqual({ kind: "image", src: "ext://brands/github.svg" });
  });

  it("uses a later URL when the first is not a known brand", () => {
    expect(
      suggestBrandKey({
        urls: ["https://example.com/app", "https://github.com/login"],
      }),
    ).toBe("brands/github.svg");
  });

  it("uses the page origin and site favicon when no brand exists", () => {
    expect(
      resolveEntryIcon(
        {
          icon: "material:key",
          pageUrl: "https://www.npmjs.com/login",
        },
        { preferSiteArtwork: true },
      ),
    ).toEqual({
      kind: "image",
      src: "https://www.google.com/s2/favicons?sz=64&domain=npmjs.com",
    });
    expect(
      resolveEntryIcon(
        { icon: "material:key" },
        {
          preferSiteArtwork: true,
          pageIconUrl: "https://static.npmjs.com/favicon.png",
        },
      ),
    ).toEqual({
      kind: "image",
      src: "https://static.npmjs.com/favicon.png",
    });
  });
});

describe("entryIconHtml", () => {
  it("emits an img for brands and a cookie-free media class", () => {
    const html = entryIconHtml(
      { icon: "brands/slack.svg" },
      { className: "detail-avatar primary cookie", assetUrl },
    );
    expect(html).toContain("entry-icon-media");
    expect(html).not.toContain("primary");
    expect(html).not.toContain("cookie");
    expect(html).toContain('src="ext://brands/slack.svg"');
    expect(html).toContain('referrerpolicy="no-referrer"');
    expect(html).toContain('data-icon-fallback="key"');
  });

  it("emits an svg for material icons", () => {
    const html = entryIconHtml({ icon: "material:key" });
    expect(html).toContain("<svg");
    expect(html).toContain(MATERIAL_KEY_PATH);
    expect(html).not.toContain("<img");
  });
});

describe("pickerVisual", () => {
  it("exposes imageSrc or glyphPath", () => {
    expect(
      pickerVisual({ icon: "brands/apple.svg" }, { assetUrl }),
    ).toEqual({
      imageSrc: "ext://brands/apple.svg",
      backdrop: false,
    });
    const material = pickerVisual({ icon: "material:key" });
    expect(material.backdrop).toBe(true);
    expect(material.glyphPath).toBe(MATERIAL_KEY_PATH);
    expect(
      pickerVisual(
        { icon: "material:key", urls: ["https://github.com"] },
        { assetUrl, preferSiteArtwork: true },
      ),
    ).toEqual({
      imageSrc: "ext://brands/github.svg",
      backdrop: false,
    });
  });
});
