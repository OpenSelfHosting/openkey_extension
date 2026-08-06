/**
 * Isolated-world bridge: injects page-script, shows passkey confirm UI,
 * and talks to the background service worker.
 */

import {
  OK_BRAND,
  createModalShell,
  iconKey,
  styleGhostButton,
  stylePrimaryButton,
} from "../shared/page_ui";

const SOURCE = "openkey-passkey";

type PasskeyCandidate = {
  uuid: string;
  title: string;
  userName?: string;
  displayName?: string;
  credentialId: string;
  rpId: string;
};

function injectPageScript(): void {
  if (document.documentElement?.dataset.openkeyPasskey === "1") return;
  if (document.documentElement) {
    document.documentElement.dataset.openkeyPasskey = "1";
  }
  const url = chrome.runtime.getURL("src/passkey/page-script.js");
  const script = document.createElement("script");
  script.src = url;
  script.async = false;
  const parent = document.documentElement || document.head || document.documentElement;
  parent.appendChild(script);
  script.addEventListener("load", () => script.remove());
}

function showPasskeyPrompt(input: {
  mode: "create" | "get";
  rpId: string;
  userName?: string;
  displayName?: string;
  candidates?: PasskeyCandidate[];
}): Promise<{ action: "confirm"; uuid?: string } | { action: "cancel" } | { action: "fallback" }> {
  return new Promise((resolve) => {
    const { root, card } = createModalShell("openkey-passkey-prompt");

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
    title.textContent =
      input.mode === "create" ? "Create passkey" : "Use passkey";
    title.style.cssText = "font-size:16px;font-weight:650;margin-bottom:8px";

    const sub = document.createElement("div");
    sub.textContent =
      input.mode === "create"
        ? `Save a passkey for ${input.rpId}${input.userName ? ` (${input.userName})` : ""}`
        : `Sign in to ${input.rpId}`;
    sub.style.cssText = `font-size:13px;color:${OK_BRAND.muted};margin-bottom:14px;line-height:1.4`;

    card.appendChild(title);
    card.appendChild(sub);

    let selectedUuid = input.candidates?.[0]?.uuid;

    if (input.mode === "get" && input.candidates && input.candidates.length) {
      const list = document.createElement("div");
      list.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-bottom:14px";
      for (const c of input.candidates) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = c.userName || c.displayName || c.title || c.credentialId.slice(0, 12);
        btn.style.cssText = [
          "text-align:left",
          "padding:10px 12px",
          "border-radius:10px",
          `border:1px solid ${OK_BRAND.border}`,
          `background:${OK_BRAND.surfaceAlt}`,
          `color:${OK_BRAND.text}`,
          "cursor:pointer",
          `font-family:${OK_BRAND.font}`,
          "font-size:13px",
        ].join(";");
        if (c.uuid === selectedUuid) {
          btn.style.outline = `2px solid ${OK_BRAND.accent}`;
        }
        btn.addEventListener("click", () => {
          selectedUuid = c.uuid;
          for (const child of Array.from(list.children)) {
            (child as HTMLElement).style.outline = "none";
          }
          btn.style.outline = `2px solid ${OK_BRAND.accent}`;
        });
        list.appendChild(btn);
      }
      card.appendChild(list);
    }

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    styleGhostButton(cancel);

    const browser = document.createElement("button");
    browser.type = "button";
    browser.textContent = "Use browser";
    styleGhostButton(browser);

    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = input.mode === "create" ? "Save passkey" : "Continue";
    stylePrimaryButton(ok);

    let settled = false;
    const finish = (action: "cancel" | "fallback" | "confirm") => {
      if (settled) return;
      settled = true;
      window.removeEventListener("keydown", onKey, true);
      root.remove();
      if (action === "confirm") resolve({ action: "confirm", uuid: selectedUuid });
      else resolve({ action });
    };

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      finish("cancel");
    }

    window.addEventListener("keydown", onKey, true);
    cancel.addEventListener("click", () => finish("cancel"));
    browser.addEventListener("click", () => finish("fallback"));
    ok.addEventListener("click", () => finish("confirm"));

    actions.appendChild(browser);
    actions.appendChild(cancel);
    actions.appendChild(ok);
    card.appendChild(actions);
    root.appendChild(card);
    root.addEventListener("click", (e) => {
      if (e.target === root) finish("cancel");
    });
    document.documentElement.appendChild(root);
  });
}

function reply(id: string, payload: unknown): void {
  window.postMessage({ source: SOURCE, type: "response", id, payload }, "*");
}

async function handleRequest(msg: {
  id: string;
  requestType: "create" | "get";
  publicKey: unknown;
  origin: string;
}): Promise<void> {
  try {
    if (msg.requestType === "create") {
      const prep = await chrome.runtime.sendMessage({
        type: "PASSKEY_PREPARE_CREATE",
        origin: msg.origin,
        publicKey: msg.publicKey,
      });
      if (!prep?.ok) {
        if (prep?.fallback) {
          reply(msg.id, { ok: false, fallback: true });
          return;
        }
        reply(msg.id, {
          ok: false,
          error: prep?.error || "Vault locked",
          name: "NotAllowedError",
        });
        return;
      }

      const choice = await showPasskeyPrompt({
        mode: "create",
        rpId: prep.rpId,
        userName: prep.userName,
        displayName: prep.displayName,
      });
      if (choice.action === "fallback") {
        reply(msg.id, { ok: false, fallback: true });
        return;
      }
      if (choice.action === "cancel") {
        reply(msg.id, {
          ok: false,
          error: "The operation either timed out or was not allowed.",
          name: "NotAllowedError",
        });
        return;
      }

      const result = await chrome.runtime.sendMessage({
        type: "PASSKEY_CREATE",
        origin: msg.origin,
        publicKey: msg.publicKey,
      });
      if (!result?.ok) {
        reply(msg.id, {
          ok: false,
          error: result?.error || "Create failed",
          name: result?.name || "NotAllowedError",
        });
        return;
      }
      reply(msg.id, { ok: true, credential: result.credential });
      return;
    }

    // get
    const prep = await chrome.runtime.sendMessage({
      type: "PASSKEY_PREPARE_GET",
      origin: msg.origin,
      publicKey: msg.publicKey,
    });
    if (!prep?.ok) {
      if (prep?.fallback) {
        reply(msg.id, { ok: false, fallback: true });
        return;
      }
      reply(msg.id, {
        ok: false,
        error: prep?.error || "No passkey",
        name: "NotAllowedError",
      });
      return;
    }

    const candidates = (prep.candidates ?? []) as PasskeyCandidate[];
    if (!candidates.length) {
      reply(msg.id, { ok: false, fallback: true });
      return;
    }

    const choice = await showPasskeyPrompt({
      mode: "get",
      rpId: prep.rpId,
      candidates,
    });
    if (choice.action === "fallback") {
      reply(msg.id, { ok: false, fallback: true });
      return;
    }
    if (choice.action === "cancel" || !choice.uuid) {
      reply(msg.id, {
        ok: false,
        error: "The operation either timed out or was not allowed.",
        name: "NotAllowedError",
      });
      return;
    }

    const result = await chrome.runtime.sendMessage({
      type: "PASSKEY_GET",
      origin: msg.origin,
      publicKey: msg.publicKey,
      uuid: choice.uuid,
    });
    if (!result?.ok) {
      reply(msg.id, {
        ok: false,
        error: result?.error || "Assert failed",
        name: result?.name || "NotAllowedError",
      });
      return;
    }
    reply(msg.id, { ok: true, credential: result.credential });
  } catch (e) {
    reply(msg.id, {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      name: "NotAllowedError",
    });
  }
}

injectPageScript();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== SOURCE || data.type !== "request") return;
  void handleRequest({
    id: String(data.id),
    requestType: data.requestType,
    publicKey: data.publicKey,
    origin: String(data.origin || location.origin),
  });
});
