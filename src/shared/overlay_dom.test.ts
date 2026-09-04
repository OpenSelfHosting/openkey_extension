import { describe, expect, it } from "vitest";
import {
  isOpenKeyUiNode,
  mutationsAffectPageFields,
  overlayPaintSignature,
} from "./overlay_dom";

function fakeEl(opts: {
  attrs?: Record<string, string>;
  nodeName?: string;
  closest?: () => Element | null;
  querySelector?: (sel: string) => Element | null;
}): Element {
  const attrs = opts.attrs ?? {};
  return {
    nodeType: 1,
    nodeName: opts.nodeName ?? "DIV",
    hasAttribute: (name: string) => name in attrs,
    getAttribute: (name: string) => attrs[name] ?? null,
    closest: opts.closest ?? (() => null),
    querySelector: opts.querySelector,
  } as unknown as Element;
}

describe("isOpenKeyUiNode", () => {
  it("recognizes overlay roots and stamped detached children", () => {
    expect(
      isOpenKeyUiNode(fakeEl({ attrs: { "data-openkey-icon": "password" } })),
    ).toBe(true);
    expect(isOpenKeyUiNode(fakeEl({ attrs: { "data-openkey-ui": "1" } }))).toBe(
      true,
    );
    expect(isOpenKeyUiNode(fakeEl({ attrs: {} }))).toBe(false);
  });
});

describe("mutationsAffectPageFields", () => {
  it("ignores detached overlay children so replaceChildren cannot resync", () => {
    const img = fakeEl({
      nodeName: "IMG",
      attrs: { "data-openkey-ui": "1" },
    });
    expect(
      mutationsAffectPageFields([{ addedNodes: [], removedNodes: [img] }]),
    ).toBe(false);
  });

  it("does not resync just because overlays already exist", () => {
    const span = fakeEl({ nodeName: "SPAN", attrs: {} });
    expect(
      mutationsAffectPageFields([{ addedNodes: [], removedNodes: [span] }]),
    ).toBe(false);
  });

  it("detects real login fields appearing or disappearing", () => {
    const input = fakeEl({ nodeName: "INPUT", attrs: {} });
    expect(
      mutationsAffectPageFields([{ addedNodes: [input], removedNodes: [] }]),
    ).toBe(true);

    const form = fakeEl({
      nodeName: "FORM",
      attrs: {},
      querySelector: (sel) => (sel.includes("input") ? input : null),
    });
    expect(
      mutationsAffectPageFields([{ addedNodes: [], removedNodes: [form] }]),
    ).toBe(true);
  });
});

describe("overlayPaintSignature", () => {
  it("changes when the dataset icon or lock state changes", () => {
    const a = overlayPaintSignature({
      kind: "password",
      unlocked: true,
      title: "Fill",
      visual: { imageSrc: "https://npmjs.com/favicon.ico", backdrop: false },
    });
    const b = overlayPaintSignature({
      kind: "password",
      unlocked: false,
      title: "Fill",
      visual: { imageSrc: "https://npmjs.com/favicon.ico", backdrop: false },
    });
    const c = overlayPaintSignature({
      kind: "password",
      unlocked: true,
      title: "Fill",
      visual: { imageSrc: "https://npmjs.com/favicon.ico", backdrop: false },
    });
    expect(a).not.toBe(b);
    expect(a).toBe(c);
  });
});
