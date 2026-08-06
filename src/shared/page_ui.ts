/**
 * Shared in-page UI primitives for content scripts and passkey bridge.
 * Keeps autofill overlays, save banners, and pickers visually aligned with
 * the popup brand (#1B6B4A forest green).
 */

export const OK_BRAND = {
  primary: "#1B6B4A",
  primaryHover: "#155A3E",
  surface: "#0f1f18",
  surfaceAlt: "#163528",
  border: "#2a4a3a",
  text: "#f2f7f4",
  muted: "rgba(242,247,244,.85)",
  overlay: "rgba(0,0,0,.35)",
  accent: "#3d9b6e",
  font: 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif',
} as const;

const SVG_NS = "http://www.w3.org/2000/svg";

function svgIcon(pathD: string, size = 16): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "display:block;fill:currentColor;pointer-events:none";
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathD);
  svg.appendChild(path);
  return svg;
}

/** Material-style key icon. */
export function iconKey(size = 16): SVGSVGElement {
  return svgIcon(
    "M12.65 10A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
    size,
  );
}

/** Credit card icon. */
export function iconCard(size = 16): SVGSVGElement {
  return svgIcon(
    "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z",
    size,
  );
}

/** Lock / token icon. */
export function iconLock(size = 16): SVGSVGElement {
  return svgIcon(
    "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10z",
    size,
  );
}

export function styleOverlayButton(btn: HTMLButtonElement): void {
  btn.style.cssText = [
    "all:initial",
    "position:fixed",
    "z-index:2147483646",
    "border:none",
    `background:${OK_BRAND.primary}`,
    `color:${OK_BRAND.text}`,
    "border-radius:8px",
    "width:28px",
    "height:28px",
    "cursor:pointer",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:0",
    "box-sizing:border-box",
    "pointer-events:auto",
    `box-shadow:0 2px 8px rgba(0,0,0,.28)`,
    "transition:background .12s ease,transform .12s ease",
  ].join(";");
  btn.addEventListener("mouseenter", () => {
    btn.style.background = OK_BRAND.primaryHover;
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = OK_BRAND.primary;
  });
}

export type PagePickerItem = {
  id: string;
  title: string;
  subtitle?: string;
};

/** Pure helper for arrow-key navigation in pickers (unit-tested). */
export function nextPickerIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return (current + delta + length) % length;
}

export function overlayEmptyHint(
  unlocked: boolean,
  kind: "password" | "username" | "card" | "token",
): string {
  if (!unlocked) return "Unlock OpenKey to autofill";
  if (kind === "password" || kind === "username") {
    return "No logins for this site — save one in OpenKey";
  }
  if (kind === "card") return "No cards in your vault";
  return "No matching secrets for this site";
}

export function showPageToast(
  message: string,
  opts?: { ms?: number },
): void {
  document.querySelector("[data-openkey-toast]")?.remove();
  const el = document.createElement("div");
  el.setAttribute("data-openkey-toast", "1");
  el.setAttribute("role", "status");
  el.textContent = message;
  el.style.cssText = [
    "all:initial",
    "position:fixed",
    "left:50%",
    "bottom:72px",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "max-width:min(360px,calc(100vw - 32px))",
    "padding:10px 14px",
    `background:${OK_BRAND.surface}`,
    `color:${OK_BRAND.text}`,
    `font:13px/1.4 ${OK_BRAND.font}`,
    "border-radius:12px",
    `border:1px solid ${OK_BRAND.border}`,
    "box-shadow:0 8px 24px rgba(0,0,0,.35)",
    "box-sizing:border-box",
    "pointer-events:none",
  ].join(";");
  document.documentElement.appendChild(el);
  window.setTimeout(() => el.remove(), opts?.ms ?? 2800);
}

export function showPagePicker(opts: {
  heading: string;
  subheading?: string;
  items: PagePickerItem[];
  attr?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const attr = opts.attr ?? "data-openkey-picker";
    document.querySelector(`[${attr}]`)?.remove();

    const root = document.createElement("div");
    root.setAttribute(attr, "1");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", opts.heading);
    root.style.cssText = [
      "all:initial",
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "display:flex",
      "align-items:flex-start",
      "justify-content:center",
      "padding:24px",
      `font-family:${OK_BRAND.font}`,
      `background:${OK_BRAND.overlay}`,
    ].join(";");

    const card = document.createElement("div");
    card.style.cssText = [
      "margin-top:48px",
      "width:min(400px,100%)",
      `background:${OK_BRAND.surface}`,
      `color:${OK_BRAND.text}`,
      "border-radius:14px",
      "padding:20px",
      "box-shadow:0 12px 40px rgba(0,0,0,.4)",
      `border:1px solid ${OK_BRAND.border}`,
      "box-sizing:border-box",
    ].join(";");

    const brand = document.createElement("div");
    brand.style.cssText =
      "display:flex;align-items:center;gap:8px;margin-bottom:12px;opacity:.9";
    const mark = document.createElement("span");
    mark.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:${OK_BRAND.primary};color:#fff`;
    mark.appendChild(iconKey(16));
    const brandName = document.createElement("span");
    brandName.textContent = "OpenKey";
    brandName.style.cssText = "font-size:13px;font-weight:650;letter-spacing:.02em";
    brand.append(mark, brandName);
    card.appendChild(brand);

    const title = document.createElement("div");
    title.textContent = opts.heading;
    title.style.cssText = "font-size:16px;font-weight:650;margin-bottom:6px";
    card.appendChild(title);

    if (opts.subheading) {
      const sub = document.createElement("div");
      sub.textContent = opts.subheading;
      sub.style.cssText = `font-size:13px;color:${OK_BRAND.muted};margin-bottom:14px;line-height:1.4`;
      card.appendChild(sub);
    }

    const list = document.createElement("div");
    list.setAttribute("role", "listbox");
    list.style.cssText =
      "display:flex;flex-direction:column;gap:8px;max-height:min(360px,60vh);overflow:auto;margin-bottom:14px";

    const itemButtons: HTMLButtonElement[] = [];
    let activeIndex = opts.items.length ? 0 : -1;

    const finish = (id: string | null) => {
      window.removeEventListener("keydown", onKey, true);
      root.remove();
      resolve(id);
    };

    const paintActive = () => {
      itemButtons.forEach((btn, i) => {
        const on = i === activeIndex;
        btn.style.outline = on ? `2px solid ${OK_BRAND.accent}` : "none";
        btn.setAttribute("aria-selected", on ? "true" : "false");
        if (on) btn.scrollIntoView({ block: "nearest" });
      });
    };

    for (const item of opts.items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.dataset.id = item.id;
      btn.style.cssText = [
        "all:unset",
        "display:block",
        "text-align:left",
        "padding:10px 12px",
        "border-radius:10px",
        `border:1px solid ${OK_BRAND.border}`,
        `background:${OK_BRAND.surfaceAlt}`,
        `color:${OK_BRAND.text}`,
        "cursor:pointer",
        "box-sizing:border-box",
        "width:100%",
      ].join(";");
      const name = document.createElement("div");
      name.textContent = item.title;
      name.style.cssText = "font-weight:600;font-size:14px";
      btn.appendChild(name);
      if (item.subtitle) {
        const s = document.createElement("div");
        s.textContent = item.subtitle;
        s.style.cssText = "font-size:12px;opacity:.8;margin-top:2px";
        btn.appendChild(s);
      }
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        finish(item.id);
      });
      btn.addEventListener("mouseenter", () => {
        activeIndex = itemButtons.indexOf(btn);
        paintActive();
      });
      list.appendChild(btn);
      itemButtons.push(btn);
    }
    card.appendChild(list);

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.style.cssText = [
      "padding:8px 14px",
      `border:1px solid ${OK_BRAND.border}`,
      "border-radius:8px",
      "background:transparent",
      `color:${OK_BRAND.text}`,
      "cursor:pointer",
      `font-family:${OK_BRAND.font}`,
      "font-size:13px",
    ].join(";");
    cancel.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      finish(null);
    });
    card.appendChild(cancel);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        activeIndex = nextPickerIndex(
          activeIndex,
          e.key === "ArrowDown" ? 1 : -1,
          itemButtons.length,
        );
        paintActive();
        return;
      }
      if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const id = itemButtons[activeIndex]?.dataset.id;
        finish(id ?? null);
      }
    };

    root.addEventListener("click", (e) => {
      if (e.target === root) finish(null);
    });
    window.addEventListener("keydown", onKey, true);
    root.appendChild(card);
    document.documentElement.appendChild(root);
    paintActive();
    cancel.focus();
  });
}

export function stylePrimaryButton(btn: HTMLButtonElement): void {
  btn.style.cssText = [
    "border:none",
    `background:${OK_BRAND.primary}`,
    "color:#fff",
    "border-radius:8px",
    "padding:8px 14px",
    "cursor:pointer",
    "font-weight:600",
    `font-family:${OK_BRAND.font}`,
    "font-size:13px",
  ].join(";");
}

export function styleGhostButton(btn: HTMLButtonElement): void {
  btn.style.cssText = [
    `border:1px solid rgba(255,255,255,.25)`,
    "background:transparent",
    `color:${OK_BRAND.text}`,
    "border-radius:8px",
    "padding:8px 12px",
    "cursor:pointer",
    `font-family:${OK_BRAND.font}`,
    "font-size:13px",
  ].join(";");
}

export function createModalShell(id: string): {
  root: HTMLDivElement;
  card: HTMLDivElement;
} {
  document.getElementById(id)?.remove();
  const root = document.createElement("div");
  root.id = id;
  root.style.cssText = [
    "all:initial",
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:flex",
    "align-items:flex-start",
    "justify-content:center",
    "padding:24px",
    `font-family:${OK_BRAND.font}`,
    `background:${OK_BRAND.overlay}`,
  ].join(";");

  const card = document.createElement("div");
  card.style.cssText = [
    "margin-top:48px",
    "width:min(400px,100%)",
    `background:${OK_BRAND.surface}`,
    `color:${OK_BRAND.text}`,
    "border-radius:14px",
    "padding:20px",
    "box-shadow:0 12px 40px rgba(0,0,0,.4)",
    `border:1px solid ${OK_BRAND.border}`,
    "box-sizing:border-box",
  ].join(";");

  return { root, card };
}
