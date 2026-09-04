/**
 * Chrome's password dropdown is browser chrome (not DOM). z-index cannot cover
 * it — we must stop Chrome from classifying the field as a login control.
 *
 * `autocomplete="off"` is ignored on login fields; the readonly-on-pointerdown
 * trick (Bitwarden / KeePassXC) is what actually suppresses the native popup.
 */

export const OPENKEY_NATIVE_FLAG = "openkeyNative";
export const OPENKEY_SAVED_AUTOCOMPLETE = "openkeyAutocomplete";
export const OPENKEY_FORCED_READONLY = "openkeyForcedReadonly";

const HIDE_NATIVE_AUTOFILL_CSS = `
input::-webkit-credentials-auto-fill-button,
input::-webkit-contacts-auto-fill-button {
  visibility: hidden !important;
  display: none !important;
  pointer-events: none !important;
  position: absolute !important;
  right: 0 !important;
  width: 0 !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
`;

export function nativeAutofillHideCss(): string {
  return HIDE_NATIVE_AUTOFILL_CSS;
}

/** Dummy token Chrome will not treat as username / current-password. */
export function dummyAutocomplete(original: string): string {
  const a = original.trim().toLowerCase();
  if (a === "one-time-code" || a.includes("otp") || a.startsWith("cc-")) {
    return original.trim() || "off";
  }
  return "off";
}

export function shouldSuppressNativeAutofill(
  kind: "password" | "username" | "card" | "token",
): boolean {
  return kind === "password" || kind === "username";
}

/** Best favicon URL already declared on the document. */
export function documentFaviconUrl(doc: Document): string | undefined {
  const nodes = doc.querySelectorAll<HTMLLinkElement>(
    'link[rel~="icon"], link[rel="apple-touch-icon"]',
  );
  let best: string | undefined;
  let bestSize = 0;
  for (const link of nodes) {
    if (!link.href) continue;
    const sizes = link.sizes?.value ?? "";
    const parsed = parseInt(sizes, 10);
    const n = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    if (!best || n >= bestSize) {
      best = link.href;
      bestSize = n;
    }
  }
  return best;
}

type SuppressHandlers = {
  arm: EventListener;
  disarm: EventListener;
};

const suppressed = new WeakMap<
  HTMLInputElement | HTMLTextAreaElement,
  SuppressHandlers
>();

export function applyNativeAutofillSuppress(
  el: HTMLInputElement | HTMLTextAreaElement,
  opts?: { armNow?: boolean },
): void {
  if (el.dataset[OPENKEY_NATIVE_FLAG] !== "1") {
    el.dataset[OPENKEY_NATIVE_FLAG] = "1";
    el.dataset[OPENKEY_SAVED_AUTOCOMPLETE] =
      el.getAttribute("autocomplete") ?? "";
    el.setAttribute(
      "autocomplete",
      dummyAutocomplete(el.dataset[OPENKEY_SAVED_AUTOCOMPLETE] ?? ""),
    );

    const arm: EventListener = () => {
      if (document.activeElement === el) return;
      if (
        el.hasAttribute("readonly") &&
        el.dataset[OPENKEY_FORCED_READONLY] !== "1"
      ) {
        return;
      }
      el.setAttribute("readonly", "readonly");
      el.dataset[OPENKEY_FORCED_READONLY] = "1";
    };
    const disarm: EventListener = () => {
      window.setTimeout(() => {
        if (el.dataset[OPENKEY_FORCED_READONLY] !== "1") return;
        el.removeAttribute("readonly");
        delete el.dataset[OPENKEY_FORCED_READONLY];
      }, 50);
    };

    el.addEventListener("pointerdown", arm, true);
    el.addEventListener("mousedown", arm, true);
    el.addEventListener("touchstart", arm, { capture: true, passive: true });
    el.addEventListener("focus", disarm, true);
    suppressed.set(el, { arm, disarm });
  }

  // Same-event pointerdown: listeners just attached would miss this click.
  if (opts?.armNow && document.activeElement !== el) {
    if (
      el.hasAttribute("readonly") &&
      el.dataset[OPENKEY_FORCED_READONLY] !== "1"
    ) {
      return;
    }
    el.setAttribute("readonly", "readonly");
    el.dataset[OPENKEY_FORCED_READONLY] = "1";
  }
}

export function restoreNativeAutofill(
  el: HTMLInputElement | HTMLTextAreaElement,
): void {
  const rec = suppressed.get(el);
  if (!rec) {
    if (el.dataset[OPENKEY_NATIVE_FLAG] !== "1") return;
  } else {
    el.removeEventListener("pointerdown", rec.arm, true);
    el.removeEventListener("mousedown", rec.arm, true);
    el.removeEventListener("touchstart", rec.arm, true);
    el.removeEventListener("focus", rec.disarm, true);
    suppressed.delete(el);
  }
  if (el.dataset[OPENKEY_FORCED_READONLY] === "1") {
    el.removeAttribute("readonly");
    delete el.dataset[OPENKEY_FORCED_READONLY];
  }
  const original = el.dataset[OPENKEY_SAVED_AUTOCOMPLETE];
  if (original) el.setAttribute("autocomplete", original);
  else el.removeAttribute("autocomplete");
  delete el.dataset[OPENKEY_NATIVE_FLAG];
  delete el.dataset[OPENKEY_SAVED_AUTOCOMPLETE];
}

export function injectNativeAutofillHideStyle(doc: Document = document): void {
  if (doc.getElementById("openkey-native-autofill-hide")) return;
  const style = doc.createElement("style");
  style.id = "openkey-native-autofill-hide";
  style.textContent = nativeAutofillHideCss();
  (doc.head ?? doc.documentElement).appendChild(style);
}
