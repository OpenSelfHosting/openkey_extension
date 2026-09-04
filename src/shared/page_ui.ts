/**
 * Shared in-page UI primitives for content scripts and passkey bridge.
 * Autofill picker rows follow OpenKey Android Autofill (icon + username +
 * masked password, field-anchored popup, Unlock / Suggest / Manage actions).
 * Surfaces follow the popup Material Expressive tokens (seed #1B6B4A).
 */

import {
  MATERIAL_KEY_PATH,
  pickerVisual,
  runtimeAssetUrl,
} from "./entry_icon";
import type { PickerVisual } from "./entry_icon";
import { stampOpenKeyUiTree } from "./overlay_dom";

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

export const AUTOFILL_PASSWORD_MASKED = "••••••••";
export const AUTOFILL_MAX_CREDENTIALS = 10;
export const AUTOFILL_UNLOCK_ID = "__openkey_unlock";
export const AUTOFILL_SUGGEST_ID = "__openkey_suggest";
export const AUTOFILL_MANAGE_ID = "__openkey_manage";
/** Picker closed because the vault was unlocked in the popup / app. */
export const PICKER_SESSION_UNLOCKED = "__openkey_session_unlocked";

export type AutofillTheme = {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  outline: string;
  hover: string;
  overlay: string;
  shadow: string;
  font: string;
  dark: boolean;
};

export function autofillTheme(dark?: boolean): AutofillTheme {
  const isDark =
    dark ??
    (typeof matchMedia === "function" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  if (isDark) {
    return {
      primary: "#8cd5ae",
      onPrimary: "#003822",
      primaryContainer: "#0f5137",
      onPrimaryContainer: "#a8f2c8",
      secondaryContainer: "#2a4034",
      onSecondaryContainer: "#c5ead4",
      surface: "#1a221e",
      surfaceAlt: "#24302a",
      text: "#e2e8e4",
      muted: "#a3b0a9",
      outline: "#3a4741",
      hover: "#24302a",
      overlay: "rgba(0,0,0,.28)",
      shadow: "0 8px 28px rgba(0,0,0,.45)",
      font: OK_BRAND.font,
      dark: true,
    };
  }
  return {
    primary: "#1b6b4a",
    onPrimary: "#ffffff",
    primaryContainer: "#a8f2c8",
    onPrimaryContainer: "#002112",
    secondaryContainer: "#d1e8d7",
    onSecondaryContainer: "#0d291a",
    surface: "#ffffff",
    surfaceAlt: "#e8eee9",
    text: "#161d19",
    muted: "#55635c",
    outline: "#c5d0c9",
    hover: "#e8eee9",
    overlay: "rgba(15,21,18,.22)",
    shadow: "0 8px 28px rgba(22,29,25,.18)",
    font: OK_BRAND.font,
    dark: false,
  };
}

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
    "width:32px",
    "height:32px",
    "cursor:pointer",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:0",
    "box-sizing:border-box",
    "overflow:hidden",
    "pointer-events:auto",
    `box-shadow:0 2px 8px rgba(0,0,0,.28)`,
    "transition:background .12s ease,transform .12s ease",
  ].join(";");
}

/** Paint the in-page overlay like an Android Autofill dataset icon. */
export function paintOverlayButton(
  btn: HTMLButtonElement,
  opts: {
    kind: "password" | "username" | "card" | "token";
    visual?: PickerVisual | null;
    unlocked: boolean;
  },
): void {
  const theme = autofillTheme();
  const top = btn.style.top;
  const left = btn.style.left;
  const vis = btn.style.visibility;
  styleOverlayButton(btn);
  if (top) btn.style.top = top;
  if (left) btn.style.left = left;
  if (vis) btn.style.visibility = vis;
  btn.replaceChildren();

  const loginKind = opts.kind === "password" || opts.kind === "username";
  if (loginKind && opts.unlocked && opts.visual) {
    btn.style.background = "transparent";
    btn.style.color = theme.onSecondaryContainer;
    btn.appendChild(renderAutofillEntryIcon(theme, opts.visual, 32));
    btn.onmouseenter = () => {
      btn.style.transform = "scale(1.06)";
    };
    btn.onmouseleave = () => {
      btn.style.transform = "";
    };
    stampOpenKeyUiTree(btn);
    return;
  }

  if (loginKind) {
    btn.style.background = "transparent";
    btn.style.boxShadow = "0 2px 8px rgba(0,0,0,.18)";
    btn.appendChild(appMark(theme, 32));
    btn.onmouseenter = () => {
      btn.style.transform = "scale(1.06)";
    };
    btn.onmouseleave = () => {
      btn.style.transform = "";
    };
    stampOpenKeyUiTree(btn);
    return;
  }

  btn.style.background = OK_BRAND.primary;
  btn.style.color = OK_BRAND.text;
  btn.appendChild(
    opts.kind === "card"
      ? iconCard(16)
      : opts.kind === "token"
        ? iconLock(16)
        : iconKey(16),
  );
  btn.onmouseenter = () => {
    btn.style.background = OK_BRAND.primaryHover;
  };
  btn.onmouseleave = () => {
    btn.style.background = OK_BRAND.primary;
  };
  stampOpenKeyUiTree(btn);
}

export type PagePickerIcon = "key" | "card" | "lock" | "app";

export type PagePickerRow = "credential" | "action";

export type PagePickerItem = {
  id: string;
  title: string;
  subtitle?: string;
  row?: PagePickerRow;
  icon?: PagePickerIcon;
  /** Brand / custom PNG loaded via chrome-extension or data URL. */
  imageSrc?: string;
  /** Material icon path `d` when not using imageSrc. */
  glyphPath?: string;
  /** Material glyphs get a tinted plate; brand / custom images do not. */
  backdrop?: boolean;
  trailing?: boolean;
  masked?: boolean;
};

export type AutofillLoginEntry = {
  uuid: string;
  title?: string;
  username?: string;
  icon?: string;
  urls?: string[];
};

/** Username if present, else title — same as Android Autofill displayName. */
export function autofillLoginDisplayName(entry: AutofillLoginEntry): string {
  const username = entry.username?.trim() ?? "";
  if (username) return username;
  const title = entry.title?.trim() ?? "";
  return title || "Login";
}

/** Suggest password when the form has a password field and no matches, or new-password. */
export function shouldSuggestPassword(input: {
  hasPasswordField: boolean;
  matchCount: number;
  hasNewPassword: boolean;
}): boolean {
  return input.hasPasswordField && (input.matchCount === 0 || input.hasNewPassword);
}

export function loginAutofillItems(input: {
  unlocked: boolean;
  entries: AutofillLoginEntry[];
  includeSuggest: boolean;
  pageUrl?: string;
  pageIconUrl?: string;
}): PagePickerItem[] {
  if (!input.unlocked) {
    return [
      {
        id: AUTOFILL_UNLOCK_ID,
        title: "Unlock OpenKey",
        row: "action",
        icon: "app",
        trailing: false,
      },
    ];
  }
  const items: PagePickerItem[] = input.entries
    .slice(0, AUTOFILL_MAX_CREDENTIALS)
    .map((entry) => {
      const visual = pickerVisual(
        { ...entry, pageUrl: input.pageUrl },
        {
          preferSiteArtwork: true,
          pageIconUrl: input.pageIconUrl,
        },
      );
      return {
        id: entry.uuid,
        title: autofillLoginDisplayName(entry),
        subtitle: AUTOFILL_PASSWORD_MASKED,
        row: "credential" as const,
        icon: "key" as const,
        imageSrc: visual.imageSrc,
        glyphPath: visual.glyphPath,
        backdrop: visual.backdrop,
        masked: true,
      };
    });
  if (input.includeSuggest) {
    items.push({
      id: AUTOFILL_SUGGEST_ID,
      title: "Suggest password",
      row: "action",
      icon: "app",
      trailing: false,
    });
  }
  items.push({
    id: AUTOFILL_MANAGE_ID,
    title: "Manage passwords…",
    row: "action",
    icon: "app",
    trailing: false,
  });
  return items;
}

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
  const t = autofillTheme();
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
    `background:${t.surface}`,
    `color:${t.text}`,
    `font:13px/1.4 ${t.font}`,
    "border-radius:12px",
    `border:1px solid ${t.outline}`,
    `box-shadow:${t.shadow}`,
    "box-sizing:border-box",
    "pointer-events:none",
  ].join(";");
  stampOpenKeyUiTree(el);
  document.documentElement.appendChild(el);
  window.setTimeout(() => el.remove(), opts?.ms ?? 2800);
}

/** Matches Android AutofillEntryIcon: 64px raster, 4px inset, 14px corner on material. */
export const AUTOFILL_ICON_SIZE = 32;
const AUTOFILL_ICON_INSET = 4;
const AUTOFILL_MATERIAL_RADIUS = 7;

function rowIcon(kind: PagePickerIcon | undefined, size = 16): SVGSVGElement {
  if (kind === "card") return iconCard(size);
  if (kind === "lock") return iconLock(size);
  return iconKey(size);
}

function glyphFromPath(pathD: string, size: number): SVGSVGElement {
  return svgIcon(pathD, size);
}

function iconFrame(size: number, extra: string[]): HTMLSpanElement {
  const mark = document.createElement("span");
  mark.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    `width:${size}px`,
    `height:${size}px`,
    "flex-shrink:0",
    "overflow:hidden",
    "box-sizing:border-box",
    ...extra,
  ].join(";");
  return mark;
}

/**
 * Login icon as in OpenKey Android Autofill: brand/custom fill the 32dp
 * tile without a tinted plate; Material sits on secondary-container.
 */
export function renderAutofillEntryIcon(
  theme: AutofillTheme,
  visual: PickerVisual | undefined,
  size = AUTOFILL_ICON_SIZE,
): HTMLSpanElement {
  if (visual?.imageSrc) {
    const mark = iconFrame(size, [
      `border-radius:${AUTOFILL_MATERIAL_RADIUS}px`,
      `padding:${AUTOFILL_ICON_INSET}px`,
      // Dark autofill rows hide black Simple Icons; keep a light plate.
      `background:${theme.dark ? "#f4f7f5" : "transparent"}`,
    ]);
    const img = document.createElement("img");
    img.alt = "";
    img.src = visual.imageSrc;
    img.referrerPolicy = "no-referrer";
    img.style.cssText =
      "width:100%;height:100%;object-fit:contain;display:block;pointer-events:none";
    img.addEventListener("error", () => {
      mark.replaceChildren(
        glyphFromPath(MATERIAL_KEY_PATH, Math.round(size * 0.52)),
      );
      mark.style.background = theme.secondaryContainer;
      mark.style.color = theme.onSecondaryContainer;
      mark.style.padding = "0";
      stampOpenKeyUiTree(mark);
    });
    mark.appendChild(img);
    return mark;
  }

  const mark = iconFrame(size, [
    `border-radius:${AUTOFILL_MATERIAL_RADIUS}px`,
    `background:${theme.secondaryContainer}`,
    `color:${theme.onSecondaryContainer}`,
  ]);
  const path = visual?.glyphPath ?? MATERIAL_KEY_PATH;
  mark.appendChild(glyphFromPath(path, Math.round(size * 0.52)));
  return mark;
}

/** Toolbar / autofill OpenKey mark (`icons/icon48.png`). */
export function extensionAppIconUrl(): string {
  return runtimeAssetUrl("icons/icon48.png");
}

function appMark(theme: AutofillTheme, size = 32): HTMLSpanElement {
  const mark = iconFrame(size, [
    "border-radius:8px",
    "background:transparent",
    "padding:0",
  ]);
  const img = document.createElement("img");
  img.alt = "";
  img.src = extensionAppIconUrl();
  img.style.cssText =
    "width:100%;height:100%;object-fit:contain;display:block;pointer-events:none";
  img.addEventListener("error", () => {
    mark.style.background = theme.primary;
    mark.style.color = theme.onPrimary;
    mark.replaceChildren(iconKey(Math.round(size * 0.5)));
    stampOpenKeyUiTree(mark);
  });
  mark.appendChild(img);
  return mark;
}

function glyphMark(
  theme: AutofillTheme,
  icon: PagePickerIcon | undefined,
  size = 32,
): HTMLSpanElement {
  const mark = iconFrame(size, [
    "border-radius:8px",
    `background:${theme.primaryContainer}`,
    `color:${theme.onPrimaryContainer}`,
  ]);
  mark.appendChild(rowIcon(icon, 18));
  return mark;
}

function positionAnchoredPanel(panel: HTMLElement, anchor: HTMLElement): void {
  const r = anchor.getBoundingClientRect();
  const width = Math.min(360, Math.max(Math.round(r.width), 280), window.innerWidth - 16);
  panel.style.width = `${width}px`;
  const h = panel.offsetHeight || 200;
  const spaceBelow = window.innerHeight - r.bottom;
  const spaceAbove = r.top;
  let top =
    spaceBelow >= Math.min(h, 168) + 8 || spaceBelow >= spaceAbove
      ? r.bottom + 6
      : r.top - h - 6;
  let left = r.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  if (top + h > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - h - 8);
  }
  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
}

let activePickerFinish: ((id: string | null) => void) | null = null;

export function dismissActivePicker(id: string | null = null): void {
  activePickerFinish?.(id);
}

export function showPagePicker(opts: {
  heading: string;
  subheading?: string;
  items: PagePickerItem[];
  attr?: string;
  anchor?: HTMLElement;
  variant?: "modal" | "autofill";
}): Promise<string | null> {
  return new Promise((resolve) => {
    const attr = opts.attr ?? "data-openkey-picker";
    const variant = opts.variant ?? (opts.anchor ? "autofill" : "modal");
    const theme = autofillTheme();
    if (activePickerFinish) activePickerFinish(null);
    document.querySelector(`[${attr}]`)?.remove();

    const root = document.createElement("div");
    root.setAttribute(attr, "1");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", opts.heading);
    const anchored = variant === "autofill" && !!opts.anchor;
    root.style.cssText = [
      "all:initial",
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      anchored ? "background:transparent;pointer-events:none" : `background:${theme.overlay}`,
      `font-family:${theme.font}`,
      anchored ? "" : "display:flex;align-items:flex-start;justify-content:center;padding:24px",
    ]
      .filter(Boolean)
      .join(";");

    const card = document.createElement("div");
    card.style.cssText = [
      anchored ? "position:fixed" : "margin-top:48px",
      anchored ? "" : "width:min(400px,100%)",
      `background:${theme.surface}`,
      `color:${theme.text}`,
      "border-radius:14px",
      anchored ? "padding:4px 0" : "padding:16px 16px 14px",
      `box-shadow:${theme.shadow}`,
      `border:1px solid ${theme.outline}`,
      "box-sizing:border-box",
      "overflow:hidden",
      "max-height:min(420px,calc(100vh - 24px))",
      "display:flex",
      "flex-direction:column",
      "pointer-events:auto",
    ]
      .filter(Boolean)
      .join(";");

    if (!anchored) {
      const brand = document.createElement("div");
      brand.style.cssText =
        "display:flex;align-items:center;gap:8px;margin-bottom:12px;opacity:.9";
      brand.appendChild(appMark(theme, 28));
      const brandName = document.createElement("span");
      brandName.textContent = "OpenKey";
      brandName.style.cssText = "font-size:13px;font-weight:650;letter-spacing:.02em";
      brand.appendChild(brandName);
      card.appendChild(brand);

      const title = document.createElement("div");
      title.textContent = opts.heading;
      title.style.cssText = "font-size:16px;font-weight:650;margin-bottom:6px";
      card.appendChild(title);

      if (opts.subheading) {
        const sub = document.createElement("div");
        sub.textContent = opts.subheading;
        sub.style.cssText = `font-size:13px;color:${theme.muted};margin-bottom:10px;line-height:1.4`;
        card.appendChild(sub);
      }
    }

    const list = document.createElement("div");
    list.setAttribute("role", "listbox");
    list.style.cssText =
      "display:flex;flex-direction:column;overflow:auto;flex:1;min-height:0";

    const itemButtons: HTMLButtonElement[] = [];
    let activeIndex = opts.items.length ? 0 : -1;
    let settled = false;

    const finish = (id: string | null) => {
      if (settled) return;
      settled = true;
      if (activePickerFinish === finish) activePickerFinish = null;
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
      document.removeEventListener("mousedown", onDocDown, true);
      root.remove();
      resolve(id);
    };
    activePickerFinish = finish;

    const paintActive = () => {
      itemButtons.forEach((btn, i) => {
        const on = i === activeIndex;
        btn.style.background = on ? theme.hover : "transparent";
        btn.setAttribute("aria-selected", on ? "true" : "false");
        if (on) btn.scrollIntoView({ block: "nearest" });
      });
    };

    let sawAction = false;
    for (const item of opts.items) {
      const row = item.row ?? (item.subtitle ? "credential" : "action");
      if (row === "action" && !sawAction && itemButtons.length) {
        const rule = document.createElement("div");
        rule.style.cssText = `height:1px;background:${theme.outline};margin:4px 0;flex-shrink:0`;
        list.appendChild(rule);
      }
      if (row === "action") sawAction = true;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.dataset.id = item.id;
      const minH = row === "action" ? 52 : 56;
      btn.style.cssText = [
        "all:unset",
        "display:flex",
        "align-items:center",
        "gap:12px",
        "box-sizing:border-box",
        "width:100%",
        `min-height:${minH}px`,
        "padding:10px 16px",
        `color:${theme.text}`,
        "cursor:pointer",
        "text-align:left",
      ].join(";");

      if (row === "action" && (item.icon ?? "app") === "app") {
        btn.appendChild(appMark(theme, AUTOFILL_ICON_SIZE));
      } else if (row === "credential") {
        btn.appendChild(
          renderAutofillEntryIcon(theme, {
            imageSrc: item.imageSrc,
            glyphPath: item.glyphPath,
            backdrop: item.backdrop !== false,
          }),
        );
      } else {
        btn.appendChild(glyphMark(theme, item.icon ?? "key", AUTOFILL_ICON_SIZE));
      }

      const textCol = document.createElement("div");
      textCol.style.cssText = "flex:1;min-width:0";
      const name = document.createElement("div");
      name.textContent = item.title;
      name.style.cssText =
        "font-weight:500;font-size:14px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
      textCol.appendChild(name);
      if (item.subtitle) {
        const s = document.createElement("div");
        s.textContent = item.subtitle;
        s.style.cssText = [
          "font-size:12px",
          `color:${theme.muted}`,
          "margin-top:2px",
          "white-space:nowrap",
          "overflow:hidden",
          "text-overflow:ellipsis",
          item.masked ? "letter-spacing:.12em" : "",
        ]
          .filter(Boolean)
          .join(";");
        textCol.appendChild(s);
      }
      btn.appendChild(textCol);

      if (row === "action" && item.trailing) {
        const trail = document.createElement("span");
        trail.style.cssText = `display:inline-flex;color:${theme.muted};flex-shrink:0`;
        trail.appendChild(iconKey(20));
        btn.appendChild(trail);
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

    if (!anchored) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.style.cssText = [
        "margin-top:12px",
        "padding:8px 14px",
        `border:1px solid ${theme.outline}`,
        "border-radius:8px",
        "background:transparent",
        `color:${theme.text}`,
        "cursor:pointer",
        `font-family:${theme.font}`,
        "font-size:13px",
        "align-self:flex-start",
      ].join(";");
      cancel.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      });
      card.appendChild(cancel);
    }

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
        if (anchored && !(e.target instanceof Node && card.contains(e.target))) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const id = itemButtons[activeIndex]?.dataset.id;
        finish(id ?? null);
      }
    };

    const onReposition = () => {
      if (opts.anchor?.isConnected) positionAnchoredPanel(card, opts.anchor);
      else if (anchored) finish(null);
    };

    const onDocDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (card.contains(target)) return;
      if (opts.anchor && opts.anchor.contains(target)) return;
      if (
        target instanceof HTMLElement &&
        target.closest("[data-openkey-icon]")
      ) {
        return;
      }
      finish(null);
    };

    if (anchored) {
      document.addEventListener("mousedown", onDocDown, true);
    } else {
      root.addEventListener("mousedown", (e) => {
        if (e.target === root) finish(null);
      });
    }
    window.addEventListener("keydown", onKey, true);
    if (anchored && opts.anchor) {
      window.addEventListener("scroll", onReposition, { capture: true, passive: true });
      window.addEventListener("resize", onReposition);
    }
    root.appendChild(card);
    stampOpenKeyUiTree(root);
    document.documentElement.appendChild(root);
    if (anchored && opts.anchor) positionAnchoredPanel(card, opts.anchor);
    paintActive();
  });
}

export function stylePrimaryButton(btn: HTMLButtonElement): void {
  const t = autofillTheme();
  btn.style.cssText = [
    "border:none",
    `background:${t.primary}`,
    `color:${t.onPrimary}`,
    "border-radius:8px",
    "padding:8px 14px",
    "cursor:pointer",
    "font-weight:600",
    `font-family:${t.font}`,
    "font-size:13px",
  ].join(";");
}

export function styleGhostButton(btn: HTMLButtonElement): void {
  const t = autofillTheme();
  btn.style.cssText = [
    `border:1px solid ${t.outline}`,
    "background:transparent",
    `color:${t.text}`,
    "border-radius:8px",
    "padding:8px 12px",
    "cursor:pointer",
    `font-family:${t.font}`,
    "font-size:13px",
  ].join(";");
}

export function createModalShell(id: string): {
  root: HTMLDivElement;
  card: HTMLDivElement;
} {
  document.getElementById(id)?.remove();
  const t = autofillTheme();
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
    `font-family:${t.font}`,
    `background:${t.overlay}`,
  ].join(";");

  const card = document.createElement("div");
  card.style.cssText = [
    "margin-top:48px",
    "width:min(400px,100%)",
    `background:${t.surface}`,
    `color:${t.text}`,
    "border-radius:14px",
    "padding:20px",
    `box-shadow:${t.shadow}`,
    `border:1px solid ${t.outline}`,
    "box-sizing:border-box",
  ].join(";");

  return { root, card };
}
