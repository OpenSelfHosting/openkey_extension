/**
 * Overlay / picker DOM helpers. Content-script MutationObservers must ignore
 * OpenKey UI nodes — including detached children after replaceChildren —
 * or the overlay remounts in a tight loop (icon flicker + high CPU).
 */

export const OPENKEY_UI_ATTR = "data-openkey-ui";

const OPENKEY_UI_CLOSEST =
  "[data-openkey-icon],[data-openkey-banner],[data-openkey-picker],[data-openkey-toast],[data-openkey-ui]";

export function stampOpenKeyUiTree(root: HTMLElement): void {
  const walk = (el: Element) => {
    if (el !== root) el.setAttribute(OPENKEY_UI_ATTR, "1");
    for (const child of el.children) walk(child);
  };
  walk(root);
}

export function isOpenKeyUiNode(node: Node): boolean {
  if (node.nodeType === 3) {
    const parent = (node as Text).parentElement;
    return !!parent && isOpenKeyUiNode(parent);
  }
  const el = node as Element;
  if (typeof el.hasAttribute !== "function") return false;
  if (el.hasAttribute(OPENKEY_UI_ATTR)) return true;
  if (
    el.hasAttribute("data-openkey-icon") ||
    el.hasAttribute("data-openkey-banner") ||
    el.hasAttribute("data-openkey-picker") ||
    el.hasAttribute("data-openkey-toast")
  ) {
    return true;
  }
  return typeof el.closest === "function" && !!el.closest(OPENKEY_UI_CLOSEST);
}

function isFormFieldNode(node: Node): boolean {
  const name = (node as { nodeName?: string }).nodeName?.toUpperCase();
  return name === "INPUT" || name === "TEXTAREA";
}

function elementContainsFormField(node: Node): boolean {
  const el = node as Partial<Element>;
  return !!el.querySelector?.("input, textarea");
}

export function mutationsAffectPageFields(
  mutations: Array<{
    addedNodes: ArrayLike<Node>;
    removedNodes: ArrayLike<Node>;
  }>,
): boolean {
  for (const m of mutations) {
    const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
    for (const node of nodes) {
      if (isOpenKeyUiNode(node)) continue;
      if (isFormFieldNode(node) || elementContainsFormField(node)) return true;
    }
  }
  return false;
}

export function overlayPaintSignature(input: {
  kind: string;
  unlocked: boolean;
  title: string;
  visual?: {
    imageSrc?: string;
    glyphPath?: string;
    backdrop?: boolean;
  } | null;
}): string {
  const v = input.visual;
  return [
    input.kind,
    input.unlocked ? "1" : "0",
    input.title,
    v?.imageSrc ?? "",
    v?.glyphPath ?? "",
    v?.backdrop === false ? "0" : "1",
  ].join("\0");
}
