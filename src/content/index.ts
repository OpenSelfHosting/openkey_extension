import type {
  DecryptedCard,
  DecryptedEntry,
  DecryptedSecret,
} from "../shared/types";
import { fillUsername } from "../shared/types";
import {
  fieldHintText,
  isAutofillIgnored,
  isLikelyTokenField,
  isLikelyUsernameField,
  selectPreferredIndex,
} from "../shared/field_match";
import { copyText } from "../shared/clipboard";
import {
  OK_BRAND,
  iconCard,
  iconKey,
  iconLock,
  overlayEmptyHint,
  showPagePicker,
  showPageToast,
  styleGhostButton,
  styleOverlayButton,
  stylePrimaryButton,
} from "../shared/page_ui";

type CaptureAction = "none" | "save" | "update" | "need_unlock";

type CaptureResponse = {
  action: CaptureAction;
  uuid?: string;
  title?: string;
  error?: string;
};

type SaveResponse = {
  ok: boolean;
  error?: string;
};

const dismissed = new Set<string>();
let bannerEl: HTMLDivElement | null = null;
let captureInFlight = false;
let overlaySyncQueued = false;
let applyingOverlays = false;
let vaultUnlocked: boolean | null = null;

type OverlayKind = "password" | "username" | "card" | "token";

type OverlayIcon = {
  field: HTMLInputElement | HTMLTextAreaElement;
  btn: HTMLButtonElement;
  kind: OverlayKind;
  place: () => void;
};

const overlayIcons: OverlayIcon[] = [];
let unlockCheckedAt = 0;
const UNLOCK_TTL_MS = 2500;

async function refreshUnlockState(force = false): Promise<boolean> {
  const now = Date.now();
  if (
    !force &&
    vaultUnlocked !== null &&
    now - unlockCheckedAt < UNLOCK_TTL_MS
  ) {
    return vaultUnlocked;
  }
  try {
    const res = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
    vaultUnlocked = !!res?.unlocked;
  } catch {
    vaultUnlocked = false;
  }
  unlockCheckedAt = Date.now();
  return !!vaultUnlocked;
}

function clearAllOverlayIcons(): void {
  for (let i = overlayIcons.length - 1; i >= 0; i--) {
    removeOverlayIcon(overlayIcons[i]!);
    overlayIcons.splice(i, 1);
  }
}

async function notifyEmpty(kind: OverlayKind): Promise<void> {
  const unlocked = await refreshUnlockState(true);
  const msg = overlayEmptyHint(unlocked, kind);
  showPageToast(msg);
}

async function generateIntoField(
  field: HTMLInputElement | HTMLTextAreaElement,
): Promise<void> {
  try {
    const res = await chrome.runtime.sendMessage({ type: "GENERATE_PASSWORD" });
    const password = res?.password as string | undefined;
    if (!password) {
      showPageToast("Could not generate password");
      return;
    }
    setNativeValue(field, password);
    let clearAfterMs = 30000;
    try {
      const settingsRes = await chrome.runtime.sendMessage({
        type: "GET_SETTINGS",
      });
      const sec = Number(settingsRes?.settings?.clipboardClearSeconds ?? 30);
      clearAfterMs = sec > 0 ? sec * 1000 : 0;
    } catch {
      /* keep default */
    }
    await copyText(password, { clearAfterMs });
    showPageToast("Generated password — copied");
  } catch {
    showPageToast("Could not generate password");
  }
}

async function offerGeneratePassword(
  field: HTMLInputElement | HTMLTextAreaElement,
): Promise<void> {
  const id = await showFillPicker({
    heading: "No logins for this site",
    items: [
      {
        id: "generate",
        title: "Generate password",
        subtitle: "Fill this field and copy to clipboard",
      },
    ],
  });
  if (id === "generate") await generateIntoField(field);
}

function preferredPasswordField(
  hint?: HTMLInputElement | null,
): HTMLInputElement | null {
  const passwords = findPasswordFields();
  if (!passwords.length) return null;
  if (hint && passwords.includes(hint)) return hint;
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement &&
    active.type === "password" &&
    passwords.includes(active)
  ) {
    return active;
  }
  const empty = passwords.find((p) => !p.value);
  return empty ?? passwords[0] ?? null;
}

function isVisible(el: HTMLElement): boolean {
  if (isAutofillIgnored(el)) return false;
  const style = window.getComputedStyle(el);
  return (
    style.visibility !== "hidden" &&
    style.display !== "none" &&
    el.offsetParent !== null
  );
}

function findPasswordFields(root: ParentNode = document): HTMLInputElement[] {
  return Array.from(
    root.querySelectorAll<HTMLInputElement>(
      'input[type="password"]:not([disabled])',
    ),
  ).filter(isVisible);
}

function findUsernameField(
  passwordField: HTMLInputElement,
): HTMLInputElement | null {
  const form = passwordField.form;
  const scope: ParentNode = form ?? document;
  const candidates = Array.from(
    scope.querySelectorAll<HTMLInputElement>(
      'input[type="email"], input[type="text"], input[name*="user" i], input[name*="email" i], input[autocomplete="username"], input[autocomplete="email"]',
    ),
  ).filter(isVisible);
  if (!candidates.length) return null;
  const before = candidates.filter(
    (c) =>
      (passwordField.compareDocumentPosition(c) &
        Node.DOCUMENT_POSITION_PRECEDING) !==
        0 ||
      (c.compareDocumentPosition(passwordField) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
  );
  return before[before.length - 1] ?? candidates[0] ?? null;
}

function findOtpFields(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[autocomplete="one-time-code"], input[name*="otp" i], input[name*="totp" i], input[inputmode="numeric"][maxlength="6"]',
    ),
  ).filter(isVisible);
}

function findCardFields(): {
  number: HTMLInputElement | null;
  name: HTMLInputElement | null;
  expiry: HTMLInputElement | null;
  cvc: HTMLInputElement | null;
} {
  const all = Array.from(
    document.querySelectorAll<HTMLInputElement>("input:not([disabled])"),
  ).filter(isVisible);

  const byAuto = (values: string[]) =>
    all.find((i) => {
      const a = (i.autocomplete || "").toLowerCase();
      return values.some((v) => a === v || a.includes(v));
    }) ?? null;

  const byName = (re: RegExp) =>
    all.find((i) =>
      re.test(`${i.name} ${i.id} ${i.placeholder} ${i.getAttribute("aria-label") ?? ""}`),
    ) ?? null;

  return {
    number:
      byAuto(["cc-number"]) ||
      byName(/card.?number|cc.?num|cardnum|credit.?card/i),
    name:
      byAuto(["cc-name"]) ||
      byName(/card.?holder|cardholder|cc.?name|name.?on.?card/i),
    expiry:
      byAuto(["cc-exp", "cc-exp-month", "cc-exp-year"]) ||
      byName(/expir|cc.?exp|valid.?thru/i),
    cvc:
      byAuto(["cc-csc", "cc-cvc"]) ||
      byName(/\bcvc\b|\bcvv\b|security.?code|card.?code/i),
  };
}

function setNativeValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findPasswordNearUsername(
  user: HTMLInputElement,
): HTMLInputElement | null {
  const form = user.form;
  const scope: ParentNode = form ?? document;
  const pwds = Array.from(
    scope.querySelectorAll<HTMLInputElement>(
      'input[type="password"]:not([disabled])',
    ),
  ).filter(isVisible);
  if (!pwds.length) return null;
  const after = pwds.filter(
    (p) =>
      (user.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING) !==
      0,
  );
  return after[0] ?? pwds[0] ?? null;
}

function fillEntry(
  entry: DecryptedEntry,
  opts?: {
    passwordField?: HTMLInputElement | HTMLTextAreaElement | null;
    usernameField?: HTMLInputElement | null;
  },
): void {
  const passwords = findPasswordFields();
  const preferred = opts?.passwordField;
  const preferredUser = opts?.usernameField;
  const preferredIdx =
    preferred instanceof HTMLInputElement &&
    preferred.type === "password" &&
    passwords.includes(preferred)
      ? passwords.indexOf(preferred)
      : null;
  const activeIdx =
    document.activeElement instanceof HTMLInputElement &&
    document.activeElement.type === "password"
      ? passwords.indexOf(document.activeElement)
      : null;
  const pwdIdx = selectPreferredIndex(passwords.length, preferredIdx, activeIdx);
  let pwd = pwdIdx >= 0 ? passwords[pwdIdx] : undefined;

  const userValue = fillUsername(entry);
  if (preferredUser) {
    if (userValue) setNativeValue(preferredUser, userValue);
    const near = findPasswordNearUsername(preferredUser);
    if (near) pwd = near;
  }
  if (pwd) {
    setNativeValue(pwd, entry.password);
    if (!preferredUser) {
      const user = findUsernameField(pwd);
      if (user && userValue) setNativeValue(user, userValue);
    }
  }
  if (entry.totp?.secret) {
    const code = (entry as DecryptedEntry & { totpCode?: string }).totpCode;
    if (code) {
      for (const otp of findOtpFields()) setNativeValue(otp, code);
    }
  }
}

function fillCard(card: DecryptedCard): void {
  const fields = findCardFields();
  if (fields.number && card.number) setNativeValue(fields.number, card.number);
  if (fields.name && card.holder) setNativeValue(fields.name, card.holder);
  if (fields.expiry && card.expiry) setNativeValue(fields.expiry, card.expiry);
  if (fields.cvc && card.cvc) setNativeValue(fields.cvc, card.cvc);
}

function fieldHint(el: HTMLInputElement | HTMLTextAreaElement): string {
  return fieldHintText([
    el.name,
    el.id,
    el.placeholder,
    el.getAttribute("aria-label"),
    el.getAttribute("autocomplete"),
    el.getAttribute("data-testid"),
  ]);
}

function findTokenFields(): Array<HTMLInputElement | HTMLTextAreaElement> {
  const all = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input:not([disabled]), textarea:not([disabled])",
    ),
  ).filter(isVisible);

  return all.filter((el) => {
    const hint = fieldHint(el);
    if (el instanceof HTMLInputElement && el.type === "password") {
      return isLikelyTokenField(hint);
    }
    if (el instanceof HTMLInputElement) {
      const type = (el.type || "text").toLowerCase();
      if (type !== "text" && type !== "search" && type !== "") return false;
    }
    return isLikelyTokenField(hint);
  });
}

function findUsernameCandidateFields(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>("input:not([disabled])"),
  )
    .filter(isVisible)
    .filter((el) =>
      isLikelyUsernameField({
        type: el.type,
        autocomplete: el.autocomplete,
        hint: fieldHint(el),
      }),
    );
}

/** Username/email fields not already covered by a password-field overlay. */
function findStandaloneUsernameFields(
  linkedToPassword: Set<HTMLInputElement>,
  skip: ReadonlySet<Element>,
): HTMLInputElement[] {
  return findUsernameCandidateFields().filter(
    (f) => !linkedToPassword.has(f) && !skip.has(f),
  );
}

function findUsernameNearToken(
  tokenField: HTMLInputElement | HTMLTextAreaElement,
): HTMLInputElement | null {
  const form =
    tokenField instanceof HTMLInputElement ? tokenField.form : null;
  const scope: ParentNode = form ?? document;
  const candidates = Array.from(
    scope.querySelectorAll<HTMLInputElement>(
      'input[type="email"], input[type="text"], input[name*="user" i], input[autocomplete="username"]',
    ),
  ).filter(isVisible);
  if (!candidates.length) return null;
  return (
    candidates.find((c) => /user|login|email|account/i.test(fieldHint(c))) ??
    candidates[0] ??
    null
  );
}

function fillSecret(
  secret: DecryptedSecret,
  opts?: { tokenField?: HTMLInputElement | HTMLTextAreaElement | null },
): void {
  const tokens = findTokenFields();
  const preferred = opts?.tokenField;
  const active = document.activeElement;
  const target =
    preferred && tokens.includes(preferred)
      ? preferred
      : active instanceof HTMLElement &&
          (active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement) &&
          tokens.includes(active)
        ? active
        : tokens[0];
  if (target && secret.secret) setNativeValue(target, secret.secret);
  if (secret.username?.trim()) {
    const user =
      (target && findUsernameNearToken(target)) ||
      Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[type="email"], input[autocomplete="username"]',
        ),
      ).filter(isVisible)[0];
    if (user) setNativeValue(user, secret.username);
  }
  if (!target && secret.secretKind === "envSnippet" && secret.secret) {
    const areas = Array.from(
      document.querySelectorAll<HTMLTextAreaElement>("textarea:not([disabled])"),
    ).filter(isVisible);
    if (areas[0]) setNativeValue(areas[0], secret.secret);
  }
}

function isOpenKeyOverlayNode(node: Node): boolean {
  return (
    node instanceof HTMLElement &&
    (node.hasAttribute("data-openkey-icon") ||
      node.hasAttribute("data-openkey-banner") ||
      node.hasAttribute("data-openkey-picker"))
  );
}

type PickerItem = {
  id: string;
  title: string;
  subtitle?: string;
};

async function showFillPicker(opts: {
  heading: string;
  items: PickerItem[];
}): Promise<string | null> {
  return showPagePicker({
    heading: opts.heading,
    items: opts.items,
    attr: "data-openkey-picker",
  });
}

async function pickAndFillLogin(
  entries: DecryptedEntry[],
  opts?: {
    passwordField?: HTMLInputElement | null;
    usernameField?: HTMLInputElement | null;
  },
): Promise<void> {
  if (!entries.length) return;
  if (entries.length === 1) {
    fillEntry(entries[0]!, opts);
    return;
  }
  const id = await showFillPicker({
    heading: "Choose a login",
    items: entries.map((e) => ({
      id: e.uuid,
      title: e.title || e.username || "Login",
      subtitle: fillUsername(e) || e.urls?.[0],
    })),
  });
  if (!id) return;
  const entry = entries.find((e) => e.uuid === id);
  if (entry) fillEntry(entry, opts);
}

async function pickAndFillCard(cards: DecryptedCard[]): Promise<void> {
  if (!cards.length) return;
  if (cards.length === 1) {
    fillCard(cards[0]!);
    return;
  }
  const id = await showFillPicker({
    heading: "Choose a card",
    items: cards.map((c) => ({
      id: c.uuid,
      title: c.name || c.holder || "Card",
      subtitle: c.number
        ? `•••• ${c.number.replace(/\s/g, "").slice(-4)}`
        : c.holder,
    })),
  });
  if (!id) return;
  const card = cards.find((c) => c.uuid === id);
  if (card) fillCard(card);
}

async function pickAndFillSecret(
  secrets: DecryptedSecret[],
  tokenField?: HTMLInputElement | HTMLTextAreaElement | null,
): Promise<void> {
  if (!secrets.length) return;
  if (secrets.length === 1) {
    fillSecret(secrets[0]!, { tokenField });
    return;
  }
  const id = await showFillPicker({
    heading: "Choose a secret",
    items: secrets.map((s) => ({
      id: s.uuid,
      title: s.name || "Secret",
      subtitle: s.username || s.secretKind || undefined,
    })),
  });
  if (!id) return;
  const secret = secrets.find((s) => s.uuid === id);
  if (secret) fillSecret(secret, { tokenField });
}

function removeOverlayIcon(icon: OverlayIcon): void {
  window.removeEventListener("scroll", icon.place, true);
  window.removeEventListener("resize", icon.place);
  try {
    visibilityObserver.unobserve(icon.field);
  } catch {
    /* field may already be detached */
  }
  icon.btn.remove();
  if (icon.kind === "password") delete icon.field.dataset.openkeyIcon;
  else if (icon.kind === "username") delete icon.field.dataset.openkeyUserIcon;
  else if (icon.kind === "card") delete icon.field.dataset.openkeyCardIcon;
  else delete icon.field.dataset.openkeyTokenIcon;
}

const visibilityObserver = new IntersectionObserver(
  () => scheduleOverlaySync(),
  { root: null, threshold: 0 },
);

function cleanupOrphanedOverlayIcons(): void {
  for (let i = overlayIcons.length - 1; i >= 0; i--) {
    const icon = overlayIcons[i]!;
    if (!icon.field.isConnected || !isVisible(icon.field)) {
      removeOverlayIcon(icon);
      overlayIcons.splice(i, 1);
    }
  }
}

function mountOverlayIcon(opts: {
  field: HTMLInputElement | HTMLTextAreaElement;
  kind: OverlayKind;
  title: string;
  onClick: () => void | Promise<void>;
}): void {
  const { field, kind, title, onClick } = opts;
  const marker =
    kind === "password"
      ? "openkeyIcon"
      : kind === "username"
        ? "openkeyUserIcon"
        : kind === "card"
          ? "openkeyCardIcon"
          : "openkeyTokenIcon";
  if (field.dataset[marker] === "1") return;
  field.dataset[marker] = "1";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = title;
  btn.setAttribute("data-openkey-icon", kind);
  btn.setAttribute("aria-label", title);
  styleOverlayButton(btn);
  btn.appendChild(
    kind === "card" ? iconCard(15) : kind === "token" ? iconLock(15) : iconKey(15),
  );

  const detach = () => {
    const idx = overlayIcons.findIndex((i) => i.btn === btn);
    if (idx < 0) return;
    removeOverlayIcon(overlayIcons[idx]!);
    overlayIcons.splice(idx, 1);
  };

  const place = () => {
    if (!field.isConnected || !isVisible(field)) {
      detach();
      return;
    }
    const r = field.getBoundingClientRect();
    // Field may report a rect of 0 when collapsing during SPA transitions.
    if (r.width < 2 || r.height < 2) {
      btn.style.visibility = "hidden";
      return;
    }
    btn.style.visibility = "visible";
    btn.style.top = `${r.top + (r.height - 28) / 2}px`;
    btn.style.left = `${r.right - 34}px`;
  };

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void onClick();
  });

  applyingOverlays = true;
  try {
    document.documentElement.appendChild(btn);
  } finally {
    applyingOverlays = false;
  }

  window.addEventListener("scroll", place, { passive: true, capture: true });
  window.addEventListener("resize", place);
  overlayIcons.push({ field, btn, kind, place });
  visibilityObserver.observe(field);
  place();
}

function syncOverlayIcons(): void {
  cleanupOrphanedOverlayIcons();

  void (async () => {
    const unlocked = await refreshUnlockState();
    if (!unlocked) {
      clearAllOverlayIcons();
      return;
    }

    const tokenFields = findTokenFields();
    const tokenSet = new Set(tokenFields);
    const linkedUsers = new Set<HTMLInputElement>();

    for (const pwd of findPasswordFields()) {
      if (tokenSet.has(pwd)) continue;
      const linked = findUsernameField(pwd);
      if (linked) linkedUsers.add(linked);
      mountOverlayIcon({
        field: pwd,
        kind: "password",
        title: "Fill with OpenKey",
        onClick: async () => {
          const res = await chrome.runtime.sendMessage({
            type: "ENTRIES_FOR_ORIGIN",
            origin: location.href,
          });
          const entries = (res?.entries ?? []) as DecryptedEntry[];
          if (!entries.length) {
            if (!pwd.value) {
              await offerGeneratePassword(pwd);
              return;
            }
            await notifyEmpty("password");
            return;
          }
          await pickAndFillLogin(entries, { passwordField: pwd });
        },
      });
    }

    for (const user of findStandaloneUsernameFields(linkedUsers, tokenSet)) {
      mountOverlayIcon({
        field: user,
        kind: "username",
        title: "Fill username with OpenKey",
        onClick: async () => {
          const res = await chrome.runtime.sendMessage({
            type: "ENTRIES_FOR_ORIGIN",
            origin: location.href,
          });
          const entries = (res?.entries ?? []) as DecryptedEntry[];
          if (!entries.length) {
            await notifyEmpty("username");
            return;
          }
          await pickAndFillLogin(entries, { usernameField: user });
        },
      });
    }

    const numberField = findCardFields().number;
    if (numberField) {
      mountOverlayIcon({
        field: numberField,
        kind: "card",
        title: "Fill card with OpenKey",
        onClick: async () => {
          const res = await chrome.runtime.sendMessage({
            type: "LIST_CARDS_FOR_FILL",
          });
          const cards = (res?.cards ?? []) as DecryptedCard[];
          if (!cards.length) {
            await notifyEmpty("card");
            return;
          }
          await pickAndFillCard(cards);
        },
      });
    }

    for (const tokenField of tokenFields) {
      mountOverlayIcon({
        field: tokenField,
        kind: "token",
        title: "Fill API token with OpenKey",
        onClick: async () => {
          const res = await chrome.runtime.sendMessage({
            type: "LIST_SECRETS_FOR_FILL",
            origin: location.href,
          });
          const secrets = (res?.secrets ?? []) as DecryptedSecret[];
          if (!secrets.length) {
            await notifyEmpty("token");
            return;
          }
          await pickAndFillSecret(secrets, tokenField);
        },
      });
    }
  })();
}

function scheduleOverlaySync(): void {
  if (overlaySyncQueued || applyingOverlays) return;
  overlaySyncQueued = true;
  requestAnimationFrame(() => {
    overlaySyncQueued = false;
    if (applyingOverlays) return;
    syncOverlayIcons();
  });
}

function mutationsAffectPageFields(mutations: MutationRecord[]): boolean {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (isOpenKeyOverlayNode(node)) continue;
      if (node instanceof HTMLInputElement) return true;
      if (node instanceof Element && node.querySelector?.("input")) return true;
    }
    for (const node of m.removedNodes) {
      if (isOpenKeyOverlayNode(node)) continue;
      if (node instanceof HTMLInputElement) return true;
      if (node instanceof Element && node.querySelector?.("input")) return true;
      // Field gone → drop orphaned icons even if we cannot inspect children.
      if (overlayIcons.length) return true;
    }
  }
  return false;
}

function dismissKey(username: string, password: string): string {
  let host = location.hostname;
  try {
    host = new URL(location.href).host;
  } catch {
    /* keep */
  }
  return `${host}\0${username}\0${password}`;
}

function readLoginFromPage(): { username: string; password: string } | null {
  const passwords = findPasswordFields();
  const pwd = passwords[0];
  if (!pwd?.value) return null;
  const user = findUsernameField(pwd);
  return {
    username: user?.value?.trim() ?? "",
    password: pwd.value,
  };
}

function removeBanner(): void {
  bannerEl?.remove();
  bannerEl = null;
}

function showBanner(opts: {
  action: "save" | "update";
  title: string;
  username: string;
  password: string;
  uuid?: string;
}): void {
  removeBanner();
  const root = document.createElement("div");
  root.setAttribute("data-openkey-banner", "1");
  root.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:16px",
    "transform:translateX(-50%)",
    "width:min(360px,calc(100vw - 32px))",
    "z-index:2147483647",
    "display:flex",
    "flex-wrap:wrap",
    "align-items:center",
    "gap:10px",
    "padding:12px 14px",
    `background:${OK_BRAND.surface}`,
    `color:${OK_BRAND.text}`,
    `font:13px/1.4 ${OK_BRAND.font}`,
    "border-radius:14px",
    "box-shadow:0 8px 28px rgba(0,0,0,.35)",
    `border:1px solid ${OK_BRAND.border}`,
    "box-sizing:border-box",
  ].join(";");

  const mark = document.createElement("div");
  mark.style.cssText = `display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:${OK_BRAND.primary};color:#fff;flex-shrink:0`;
  mark.appendChild(iconKey(15));

  const text = document.createElement("div");
  text.style.cssText = "flex:1;min-width:160px";
  const verb = opts.action === "update" ? "Update" : "Save";
  text.innerHTML = `<strong style="display:block;margin-bottom:2px">${verb} password in OpenKey?</strong>
    <span style="opacity:.85">${escapeHtml(opts.title)}${
      opts.username ? ` · ${escapeHtml(opts.username)}` : ""
    }</span>`;

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;flex-shrink:0";

  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.textContent = "Not now";
  styleGhostButton(dismissBtn);
  dismissBtn.addEventListener("click", () => {
    dismissed.add(dismissKey(opts.username, opts.password));
    removeBanner();
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = opts.action === "update" ? "Update" : "Save";
  stylePrimaryButton(saveBtn);
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    dismissBtn.disabled = true;
    saveBtn.textContent = "…";
    const message =
      opts.action === "update"
        ? {
            type: "UPDATE_LOGIN",
            uuid: opts.uuid,
            username: opts.username,
            password: opts.password,
            url: location.href,
            title: opts.title,
          }
        : {
            type: "SAVE_LOGIN",
            username: opts.username,
            password: opts.password,
            url: location.href,
            title: opts.title,
          };
    try {
      const res = (await chrome.runtime.sendMessage(message)) as SaveResponse;
      if (!res?.ok) {
        saveBtn.disabled = false;
        dismissBtn.disabled = false;
        saveBtn.textContent = opts.action === "update" ? "Update" : "Save";
        text.querySelector("span")!.textContent =
          res?.error ?? "Could not save — unlock OpenKey";
        return;
      }
      dismissed.add(dismissKey(opts.username, opts.password));
      removeBanner();
    } catch (e) {
      saveBtn.disabled = false;
      dismissBtn.disabled = false;
      saveBtn.textContent = opts.action === "update" ? "Update" : "Save";
      text.querySelector("span")!.textContent =
        e instanceof Error ? e.message : "Could not save";
    }
  });

  actions.append(dismissBtn, saveBtn);
  root.append(mark, text, actions);
  document.documentElement.appendChild(root);
  bannerEl = root;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function suggestedTitle(): string {
  try {
    const host = new URL(location.href).host;
    return host.replace(/^www\./, "") || "Login";
  } catch {
    return "Login";
  }
}

async function maybeOfferSave(): Promise<void> {
  if (captureInFlight) return;
  const login = readLoginFromPage();
  if (!login?.password) return;
  const key = dismissKey(login.username, login.password);
  if (dismissed.has(key)) return;

  captureInFlight = true;
  try {
    const res = (await chrome.runtime.sendMessage({
      type: "CAPTURED_LOGIN",
      username: login.username,
      password: login.password,
      url: location.href,
    })) as CaptureResponse;
    if (!res || res.action === "none") return;
    if (res.action === "need_unlock") {
      showPageToast("Unlock OpenKey to save this password");
      return;
    }
    if (res.action === "save" || res.action === "update") {
      showBanner({
        action: res.action,
        title: res.title || suggestedTitle(),
        username: login.username,
        password: login.password,
        uuid: res.uuid,
      });
    }
  } catch {
    /* background unavailable */
  } finally {
    captureInFlight = false;
  }
}

function isSubmitControl(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "button") {
    const type = (el as HTMLButtonElement).type || "submit";
    if (type === "submit") return true;
  }
  if (tag === "input") {
    const type = ((el as HTMLInputElement).type || "").toLowerCase();
    if (type === "submit" || type === "image" || type === "button") return true;
  }
  const text = (el.textContent ?? "").toLowerCase();
  const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
  const combined = `${text} ${aria}`;
  return /log\s*in|sign\s*in|sign\s*up|submit|continue|next|تسجيل|دخول/.test(
    combined,
  );
}

function installCaptureListeners(): void {
  const afterLoginAttempt = () => {
    void maybeOfferSave();
    // Login forms often hide/replace fields shortly after submit.
    window.setTimeout(() => scheduleOverlaySync(), 100);
    window.setTimeout(() => scheduleOverlaySync(), 800);
  };

  document.addEventListener("submit", afterLoginAttempt, true);

  document.addEventListener(
    "click",
    (e) => {
      if (!isSubmitControl(e.target)) return;
      // Defer so field values are committed.
      window.setTimeout(afterLoginAttempt, 50);
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter") return;
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (t.type === "password" || t.type === "email" || t.type === "text") {
        window.setTimeout(afterLoginAttempt, 50);
      }
    },
    true,
  );
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "OPENKEY_SESSION") {
    vaultUnlocked = !!message.unlocked;
    unlockCheckedAt = Date.now();
    scheduleOverlaySync();
    return;
  }
  if (message.type === "OPENKEY_TOAST" && typeof message.message === "string") {
    showPageToast(message.message);
    return;
  }
  if (message.type === "OPENKEY_COPY" && typeof message.text === "string") {
    const clearMs =
      typeof message.clearAfterMs === "number" ? message.clearAfterMs : 30000;
    void copyText(message.text, { clearAfterMs: clearMs }).then(() => {
      showPageToast(
        typeof message.label === "string"
          ? `${message.label} copied`
          : "Copied",
      );
    });
    return;
  }
  if (message.type === "OPENKEY_PICK_COPY" && message.entries) {
    const entries = message.entries as DecryptedEntry[];
    const field = message.field === "password" ? "password" : "username";
    void (async () => {
      if (!entries.length) return;
      let entry = entries[0]!;
      if (entries.length > 1) {
        const id = await showFillPicker({
          heading:
            field === "password" ? "Copy password from" : "Copy username from",
          items: entries.map((e) => ({
            id: e.uuid,
            title: e.title || e.username || "Login",
            subtitle: fillUsername(e) || e.urls?.[0],
          })),
        });
        if (!id) return;
        entry = entries.find((e) => e.uuid === id)!;
        if (!entry) return;
      }
      const text =
        field === "password" ? entry.password : fillUsername(entry);
      if (!text) {
        showPageToast(
          field === "password" ? "No password stored" : "No username stored",
        );
        return;
      }
      const clearMs =
        typeof message.clearAfterMs === "number" ? message.clearAfterMs : 30000;
      await copyText(text, { clearAfterMs: clearMs });
      showPageToast(field === "password" ? "Password copied" : "Username copied");
    })();
    return;
  }
  if (message.type === "OPENKEY_GENERATE_PASSWORD") {
    const field = preferredPasswordField();
    if (!field) {
      showPageToast("No password field on this page");
      return;
    }
    void generateIntoField(field);
    return;
  }
  if (message.type === "OPENKEY_FILL" && message.entry) {
    fillEntry(message.entry as DecryptedEntry);
  }
  if (message.type === "OPENKEY_FILL_CARD" && message.card) {
    fillCard(message.card as DecryptedCard);
  }
  if (message.type === "OPENKEY_FILL_SECRET" && message.secret) {
    fillSecret(message.secret as DecryptedSecret);
  }
  if (message.type === "OPENKEY_PICK_LOGIN" && message.entries) {
    void pickAndFillLogin(message.entries as DecryptedEntry[]);
  }
  if (message.type === "OPENKEY_PICK_CARD" && message.cards) {
    void pickAndFillCard(message.cards as DecryptedCard[]);
  }
  if (message.type === "OPENKEY_PICK_SECRET" && message.secrets) {
    void pickAndFillSecret(message.secrets as DecryptedSecret[]);
  }
});

syncOverlayIcons();
installCaptureListeners();
const observer = new MutationObserver((mutations) => {
  if (applyingOverlays) return;
  if (!mutationsAffectPageFields(mutations)) return;
  scheduleOverlaySync();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// SPA navigations / bfcache may leave orphaned overlays behind.
window.addEventListener("pageshow", () => scheduleOverlaySync());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleOverlaySync();
});
