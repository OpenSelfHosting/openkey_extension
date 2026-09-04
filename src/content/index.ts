import type {
  DecryptedCard,
  DecryptedEntry,
  DecryptedSecret,
  SessionState,
} from "../shared/types";
import { fillUsername, SESSION_STORAGE_KEY, sessionLooksUnlocked } from "../shared/types";
import {
  fieldHintText,
  isAutofillIgnored,
  isLikelyTokenField,
  isLikelyUsernameField,
  isNewPasswordField,
  selectPreferredIndex,
} from "../shared/field_match";
import { copyText } from "../shared/clipboard";
import {
  AUTOFILL_MANAGE_ID,
  AUTOFILL_SUGGEST_ID,
  AUTOFILL_UNLOCK_ID,
  autofillTheme,
  dismissActivePicker,
  iconKey,
  loginAutofillItems,
  overlayEmptyHint,
  paintOverlayButton,
  PICKER_SESSION_UNLOCKED,
  shouldSuggestPassword,
  showPagePicker,
  showPageToast,
  type PagePickerItem,
} from "../shared/page_ui";
import { pickerVisual } from "../shared/entry_icon";
import type { PickerVisual } from "../shared/entry_icon";
import {
  applyNativeAutofillSuppress,
  documentFaviconUrl,
  injectNativeAutofillHideStyle,
  shouldSuppressNativeAutofill,
} from "../shared/native_autofill";
import {
  mutationsAffectPageFields,
  overlayPaintSignature,
  stampOpenKeyUiTree,
} from "../shared/overlay_dom";

type CaptureAction =
  | "none"
  | "save"
  | "update"
  | "saved"
  | "updated"
  | "need_unlock"
  | "error";

type CaptureResponse = {
  action: CaptureAction;
  uuid?: string;
  title?: string;
  error?: string;
};

const dismissed = new Set<string>();
let bannerEl: HTMLDivElement | null = null;
let captureInFlight = false;
let overlaySyncQueued = false;
let applyingOverlays = false;
let overlaySyncGen = 0;
let vaultUnlocked: boolean | null = null;
const unlockWaiters = new Set<(unlocked: boolean) => void>();

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
const ORIGIN_ENTRIES_TTL_MS = 4000;
const OVERLAY_SYNC_DEBOUNCE_MS = 80;

let originFillCache: {
  href: string;
  at: number;
  entries: DecryptedEntry[];
} | null = null;

const AUTOFILL_ICON_OPTS = { preferSiteArtwork: true as const };

const USERNAME_INPUT_SEL = [
  'input[type="email"]',
  'input[type="text"]',
  'input[name*="user" i]',
  'input[name*="email" i]',
  'input[autocomplete="username"]',
  'input[autocomplete="email"]',
  'input[data-openkey-autocomplete="username"]',
  'input[data-openkey-autocomplete="email"]',
].join(", ");

function fieldAutocomplete(
  el: HTMLInputElement | HTMLTextAreaElement,
): string {
  return (
    el.dataset.openkeyAutocomplete ||
    el.getAttribute("autocomplete") ||
    el.autocomplete ||
    ""
  );
}

function pageArtwork(): { pageUrl: string; pageIconUrl?: string } {
  return {
    pageUrl: location.href,
    pageIconUrl: documentFaviconUrl(document),
  };
}

async function refreshUnlockState(force = false): Promise<boolean> {
  const now = Date.now();
  if (
    !force &&
    vaultUnlocked === true &&
    now - unlockCheckedAt < UNLOCK_TTL_MS
  ) {
    return true;
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

function applySessionUnlock(unlocked: boolean): void {
  const wasUnlocked = vaultUnlocked === true;
  vaultUnlocked = unlocked;
  unlockCheckedAt = Date.now();
  originFillCache = null;
  const waiters = [...unlockWaiters];
  unlockWaiters.clear();
  for (const w of waiters) w(unlocked);
  if (unlocked && !wasUnlocked) {
    dismissActivePicker(PICKER_SESSION_UNLOCKED);
  } else if (!unlocked && wasUnlocked) {
    dismissActivePicker(null);
  }
  scheduleOverlaySync();
}

function waitUntilUnlocked(timeoutMs: number): Promise<boolean> {
  if (vaultUnlocked) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearInterval(iv);
      unlockWaiters.delete(onUnlock);
      resolve(ok);
    };
    const onUnlock = (unlocked: boolean) => {
      if (unlocked) finish(true);
    };
    unlockWaiters.add(onUnlock);
    const iv = window.setInterval(() => {
      void refreshUnlockState(true).then((ok) => {
        if (ok) finish(true);
      });
    }, 400);
    window.setTimeout(() => finish(false), timeoutMs);
  });
}

function watchExtensionSession(): void {
  try {
    chrome.storage.session.onChanged.addListener((changes) => {
      const ch = changes[SESSION_STORAGE_KEY];
      if (!ch) return;
      applySessionUnlock(
        sessionLooksUnlocked(ch.newValue as SessionState | undefined),
      );
    });
  } catch {
    /* session storage not exposed to this page */
  }
}

async function bootstrapUnlockState(): Promise<void> {
  try {
    const data = await chrome.storage.session.get(SESSION_STORAGE_KEY);
    if (
      sessionLooksUnlocked(
        data[SESSION_STORAGE_KEY] as SessionState | undefined,
      )
    ) {
      applySessionUnlock(true);
    }
  } catch {
    /* session storage not exposed yet */
  }
  applySessionUnlock(await refreshUnlockState(true));
}

async function ensureUnlockedFromPrompt(id: string | null): Promise<boolean> {
  if (id !== AUTOFILL_UNLOCK_ID && id !== PICKER_SESSION_UNLOCKED) {
    return false;
  }
  if (id === AUTOFILL_UNLOCK_ID) {
    await openExtensionPopup();
  }
  return vaultUnlocked === true || (await waitUntilUnlocked(120_000));
}

async function promptUnlockIfNeeded(
  field: HTMLInputElement | HTMLTextAreaElement,
): Promise<boolean> {
  if (await refreshUnlockState(true)) return true;
  const id = await showFillPicker({
    heading: "OpenKey",
    items: loginAutofillItems({
      unlocked: false,
      entries: [],
      includeSuggest: false,
    }),
    anchor: field,
    variant: "autofill",
  });
  if (await ensureUnlockedFromPrompt(id)) return true;
  await handleLoginPickerChoice(id, [], field);
  return false;
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
    const res = await chrome.runtime.sendMessage({
      type: "GENERATE_PASSWORD",
      length: 20,
      options: {
        length: 20,
        lower: true,
        upper: true,
        digits: true,
        symbols: true,
      },
    });
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

async function openExtensionPopup(): Promise<void> {
  try {
    const res = await chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
    if (res?.opened) return;
  } catch {
    /* fall through */
  }
  showPageToast("Unlock OpenKey from the toolbar icon");
}

function formPasswordFields(field: HTMLElement): HTMLInputElement[] {
  const all = findPasswordFields().filter(
    (p) => !isLikelyTokenField(fieldHint(p)),
  );
  const form = field instanceof HTMLInputElement ? field.form : null;
  if (!form) return all;
  return all.filter((p) => p.form === form);
}

function loginPickerAnchor(): HTMLElement | undefined {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement &&
    (active.type === "password" ||
      isLikelyUsernameField({
        type: active.type,
        autocomplete: fieldAutocomplete(active),
        hint: fieldHint(active),
      }))
  ) {
    return active;
  }
  return preferredPasswordField() ?? undefined;
}

let loginPickerField: HTMLElement | null = null;

async function handleLoginPickerChoice(
  id: string | null,
  entries: DecryptedEntry[],
  field: HTMLInputElement | HTMLTextAreaElement,
  opts?: {
    passwordField?: HTMLInputElement | null;
    usernameField?: HTMLInputElement | null;
  },
): Promise<void> {
  if (!id) return;
  if (id === AUTOFILL_UNLOCK_ID || id === AUTOFILL_MANAGE_ID) {
    await openExtensionPopup();
    return;
  }
  if (id === AUTOFILL_SUGGEST_ID) {
    const pwd =
      opts?.passwordField ??
      (field instanceof HTMLInputElement && field.type === "password"
        ? field
        : preferredPasswordField());
    if (pwd) await generateIntoField(pwd);
    else showPageToast("No password field on this page");
    return;
  }
  const entry = entries.find((e) => e.uuid === id);
  if (entry) fillEntry(entry, opts);
}

async function openLoginAutofill(
  field: HTMLInputElement | HTMLTextAreaElement,
  opts?: {
    passwordField?: HTMLInputElement | null;
    usernameField?: HTMLInputElement | null;
  },
): Promise<void> {
  if (loginPickerField === field) return;
  loginPickerField = field;
  try {
    const unlocked = await promptUnlockIfNeeded(field);
    const passwords = formPasswordFields(field);
    const hasNewPassword = passwords.some((p) =>
      isNewPasswordField({
        autocomplete: fieldAutocomplete(p),
        hint: fieldHint(p),
      }),
    );
    if (!unlocked) {
      return;
    }
    const res = await chrome.runtime.sendMessage({
      type: "ENTRIES_FOR_ORIGIN",
      origin: location.href,
    });
    const entries = (res?.entries ?? []) as DecryptedEntry[];
    const includeSuggest = shouldSuggestPassword({
      hasPasswordField: passwords.length > 0,
      matchCount: entries.length,
      hasNewPassword,
    });
    const items = loginAutofillItems({
      unlocked: true,
      entries: entries.map((e) => ({
        uuid: e.uuid,
        title: e.title,
        username: fillUsername(e) || e.username,
        icon: e.icon,
        urls: e.urls,
      })),
      includeSuggest,
      ...pageArtwork(),
    });
    const id = await showFillPicker({
      heading: "OpenKey",
      items,
      anchor: field,
      variant: "autofill",
    });
    await handleLoginPickerChoice(id, entries, field, {
      passwordField:
        opts?.passwordField ??
        (field instanceof HTMLInputElement && field.type === "password"
          ? field
          : null),
      usernameField:
        opts?.usernameField ??
        (field instanceof HTMLInputElement && field.type !== "password"
          ? field
          : null),
    });
  } finally {
    if (loginPickerField === field) loginPickerField = null;
  }
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
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  const r = el.getBoundingClientRect();
  return r.width >= 2 && r.height >= 2;
}

async function entriesForOrigin(force = false): Promise<DecryptedEntry[]> {
  const href = location.href;
  const now = Date.now();
  if (
    !force &&
    originFillCache &&
    originFillCache.href === href &&
    now - originFillCache.at < ORIGIN_ENTRIES_TTL_MS
  ) {
    return originFillCache.entries;
  }
  const res = await chrome.runtime.sendMessage({
    type: "ENTRIES_FOR_ORIGIN",
    origin: href,
  });
  const entries = (res?.entries ?? []) as DecryptedEntry[];
  originFillCache = { href, at: now, entries };
  return entries;
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
    scope.querySelectorAll<HTMLInputElement>(USERNAME_INPUT_SEL),
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
      const a = fieldAutocomplete(i).toLowerCase();
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
    el.dataset.openkeyAutocomplete || el.getAttribute("autocomplete"),
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
        autocomplete: fieldAutocomplete(el),
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
      'input[type="email"], input[type="text"], input[name*="user" i], input[autocomplete="username"], input[data-openkey-autocomplete="username"]',
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
          'input[type="email"], input[autocomplete="username"], input[data-openkey-autocomplete="username"]',
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

async function showFillPicker(opts: {
  heading: string;
  items: PagePickerItem[];
  anchor?: HTMLElement;
  variant?: "modal" | "autofill";
}): Promise<string | null> {
  return showPagePicker({
    heading: opts.heading,
    items: opts.items,
    attr: "data-openkey-picker",
    anchor: opts.anchor,
    variant: opts.variant,
  });
}

async function pickAndFillLogin(
  entries: DecryptedEntry[],
  opts?: {
    passwordField?: HTMLInputElement | null;
    usernameField?: HTMLInputElement | null;
  },
): Promise<void> {
  const fromField = !!(opts?.passwordField || opts?.usernameField);
  if (!entries.length) return;
  if (!fromField && entries.length === 1) {
    fillEntry(entries[0]!, opts);
    return;
  }
  const anchor =
    opts?.passwordField ?? opts?.usernameField ?? loginPickerAnchor();
  const includeSuggest = shouldSuggestPassword({
    hasPasswordField: findPasswordFields().length > 0,
    matchCount: entries.length,
    hasNewPassword: findPasswordFields().some((p) =>
      isNewPasswordField({
        autocomplete: fieldAutocomplete(p),
        hint: fieldHint(p),
      }),
    ),
  });
  const items = loginAutofillItems({
    unlocked: true,
    entries: entries.map((e) => ({
      uuid: e.uuid,
      title: e.title,
      username: fillUsername(e) || e.username,
      icon: e.icon,
      urls: e.urls,
    })),
    includeSuggest,
    ...pageArtwork(),
  });
  const id = await showFillPicker({
    heading: "Choose a login",
    items,
    anchor,
    variant: anchor ? "autofill" : "modal",
  });
  const field =
    opts?.passwordField ??
    opts?.usernameField ??
    preferredPasswordField();
  if (field) {
    await handleLoginPickerChoice(id, entries, field, opts);
    return;
  }
  if (!id) return;
  if (id === AUTOFILL_UNLOCK_ID || id === AUTOFILL_MANAGE_ID) {
    await openExtensionPopup();
    return;
  }
  const entry = entries.find((e) => e.uuid === id);
  if (entry) fillEntry(entry, opts);
}

async function pickAndFillCard(
  cards: DecryptedCard[],
  anchor?: HTMLElement,
): Promise<void> {
  if (!cards.length) return;
  if (!anchor && cards.length === 1) {
    fillCard(cards[0]!);
    return;
  }
  const items: PagePickerItem[] = cards.map((c) => ({
    id: c.uuid,
    title: c.name || c.holder || "Card",
    subtitle: c.number
      ? `•••• ${c.number.replace(/\s/g, "").slice(-4)}`
      : c.holder,
    row: "credential",
    icon: "card",
  }));
  const id = await showFillPicker({
    heading: "Choose a card",
    items,
    anchor,
    variant: anchor ? "autofill" : "modal",
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
  if (!tokenField && secrets.length === 1) {
    fillSecret(secrets[0]!, { tokenField });
    return;
  }
  const items: PagePickerItem[] = secrets.map((s) => ({
    id: s.uuid,
    title: s.name || "Secret",
    subtitle: s.username || s.secretKind || undefined,
    row: "credential",
    icon: "lock",
  }));
  const id = await showFillPicker({
    heading: "Choose a secret",
    items,
    anchor: tokenField ?? undefined,
    variant: tokenField ? "autofill" : "modal",
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
  (entries) => {
    for (const entry of entries) {
      const icon = overlayIcons.find((i) => i.field === entry.target);
      if (!icon) continue;
      if (!entry.isIntersecting || !icon.field.isConnected) {
        icon.btn.style.visibility = "hidden";
        continue;
      }
      icon.place();
    }
  },
  { root: null, threshold: 0 },
);

function cleanupOrphanedOverlayIcons(): void {
  for (let i = overlayIcons.length - 1; i >= 0; i--) {
    const icon = overlayIcons[i]!;
    if (!icon.field.isConnected) {
      removeOverlayIcon(icon);
      overlayIcons.splice(i, 1);
    }
  }
}

function mountOverlayIcon(opts: {
  field: HTMLInputElement | HTMLTextAreaElement;
  kind: OverlayKind;
  title: string;
  visual?: PickerVisual | null;
  unlocked: boolean;
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
  if (field.dataset[marker] === "1") {
    const existing = overlayIcons.find(
      (i) => i.field === field && i.kind === kind,
    );
    if (existing) {
      existing.btn.title = title;
      existing.btn.setAttribute("aria-label", title);
      const sig = overlayPaintSignature({
        kind,
        unlocked: opts.unlocked,
        title,
        visual: opts.visual,
      });
      if (existing.btn.dataset.openkeyPaint === sig) return;
      existing.btn.dataset.openkeyPaint = sig;
      paintOverlayButton(existing.btn, {
        kind,
        visual: opts.visual,
        unlocked: opts.unlocked,
      });
    }
    return;
  }
  field.dataset[marker] = "1";
  if (shouldSuppressNativeAutofill(kind)) {
    applyNativeAutofillSuppress(field);
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = title;
  btn.setAttribute("data-openkey-icon", kind);
  btn.setAttribute("aria-label", title);
  paintOverlayButton(btn, {
    kind,
    visual: opts.visual,
    unlocked: opts.unlocked,
  });
  btn.dataset.openkeyPaint = overlayPaintSignature({
    kind,
    unlocked: opts.unlocked,
    title,
    visual: opts.visual,
  });

  const detach = () => {
    const idx = overlayIcons.findIndex((i) => i.btn === btn);
    if (idx < 0) return;
    removeOverlayIcon(overlayIcons[idx]!);
    overlayIcons.splice(idx, 1);
  };

  const place = () => {
    if (!field.isConnected) {
      detach();
      return;
    }
    const r = field.getBoundingClientRect();
    if (!isVisible(field) || r.width < 2 || r.height < 2) {
      btn.style.visibility = "hidden";
      return;
    }
    btn.style.visibility = "visible";
    btn.style.top = `${r.top + (r.height - 32) / 2}px`;
    btn.style.left = `${r.right - 38}px`;
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
  const gen = ++overlaySyncGen;

  void (async () => {
    const unlocked = await refreshUnlockState();
    if (gen !== overlaySyncGen) return;
    const tokenFields = findTokenFields();
    const tokenSet = new Set(tokenFields);
    const linkedUsers = new Set<HTMLInputElement>();
    let loginVisual: PickerVisual | null = null;
    if (unlocked) {
      try {
        const entries = await entriesForOrigin();
        if (gen !== overlaySyncGen) return;
        const first = entries[0];
        if (first) {
          loginVisual = pickerVisual(
            {
              icon: first.icon,
              title: first.title,
              urls: first.urls,
              username: fillUsername(first) || first.username,
              ...pageArtwork(),
            },
            AUTOFILL_ICON_OPTS,
          );
        }
      } catch {
        loginVisual = null;
      }
    }

    for (const pwd of findPasswordFields()) {
      if (tokenSet.has(pwd)) continue;
      const linked = findUsernameField(pwd);
      if (linked) linkedUsers.add(linked);
      mountOverlayIcon({
        field: pwd,
        kind: "password",
        title: unlocked ? "Fill with OpenKey" : "Unlock OpenKey",
        visual: loginVisual,
        unlocked,
        onClick: () =>
          openLoginAutofill(pwd, { passwordField: pwd }),
      });
    }

    for (const user of findStandaloneUsernameFields(linkedUsers, tokenSet)) {
      mountOverlayIcon({
        field: user,
        kind: "username",
        title: unlocked ? "Fill username with OpenKey" : "Unlock OpenKey",
        visual: loginVisual,
        unlocked,
        onClick: () =>
          openLoginAutofill(user, { usernameField: user }),
      });
    }

    const numberField = findCardFields().number;
    if (numberField) {
      mountOverlayIcon({
        field: numberField,
        kind: "card",
        title: unlocked ? "Fill card with OpenKey" : "Unlock OpenKey",
        unlocked,
        onClick: async () => {
          if (!(await promptUnlockIfNeeded(numberField))) return;
          const res = await chrome.runtime.sendMessage({
            type: "LIST_CARDS_FOR_FILL",
          });
          const cards = (res?.cards ?? []) as DecryptedCard[];
          if (!cards.length) {
            await notifyEmpty("card");
            return;
          }
          await pickAndFillCard(cards, numberField);
        },
      });
    }

    for (const tokenField of tokenFields) {
      mountOverlayIcon({
        field: tokenField,
        kind: "token",
        title: unlocked ? "Fill API token with OpenKey" : "Unlock OpenKey",
        unlocked,
        onClick: async () => {
          if (!(await promptUnlockIfNeeded(tokenField))) return;
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
  if (applyingOverlays) return;
  if (overlaySyncQueued) return;
  overlaySyncQueued = true;
  window.setTimeout(() => {
    overlaySyncQueued = false;
    if (applyingOverlays) return;
    syncOverlayIcons();
  }, OVERLAY_SYNC_DEBOUNCE_MS);
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

function showSavedNotice(opts: {
  updated: boolean;
  title: string;
  username: string;
}): void {
  removeBanner();
  const theme = autofillTheme();
  const root = document.createElement("div");
  root.setAttribute("data-openkey-banner", "1");
  root.setAttribute("role", "status");
  root.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:16px",
    "transform:translateX(-50%)",
    "width:min(360px,calc(100vw - 32px))",
    "z-index:2147483647",
    "display:flex",
    "align-items:center",
    "gap:10px",
    "padding:12px 14px",
    `background:${theme.surface}`,
    `color:${theme.text}`,
    `font:13px/1.4 ${theme.font}`,
    "border-radius:14px",
    `box-shadow:${theme.shadow}`,
    `border:1px solid ${theme.outline}`,
    "box-sizing:border-box",
  ].join(";");

  const mark = document.createElement("div");
  mark.style.cssText = `display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:${theme.primary};color:${theme.onPrimary};flex-shrink:0`;
  mark.appendChild(iconKey(15));

  const text = document.createElement("div");
  text.style.cssText = "flex:1;min-width:160px";
  const heading = opts.updated ? "Password updated" : "Password saved";
  text.innerHTML = `<strong style="display:block;margin-bottom:2px">${heading} in OpenKey</strong>
    <span style="opacity:.85">${escapeHtml(opts.title)}${
      opts.username ? ` · ${escapeHtml(opts.username)}` : ""
    }</span>`;

  root.append(mark, text);
  stampOpenKeyUiTree(root);
  document.documentElement.appendChild(root);
  bannerEl = root;
  window.setTimeout(() => {
    if (bannerEl === root) removeBanner();
  }, 3600);
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
      pageIconUrl: documentFaviconUrl(document),
    })) as CaptureResponse;
    if (!res || res.action === "none") return;
    if (res.action === "need_unlock") {
      showPageToast("Unlock OpenKey to save this password");
      return;
    }
    if (res.action === "error") {
      showPageToast(res.error ?? "Could not save password");
      return;
    }
    if (res.action === "saved" || res.action === "updated") {
      dismissed.add(key);
      showSavedNotice({
        updated: res.action === "updated",
        title: res.title || suggestedTitle(),
        username: login.username,
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

function isLoginAutofillTarget(el: EventTarget | null): el is HTMLInputElement {
  if (
    !(el instanceof HTMLInputElement) ||
    !isVisible(el) ||
    isAutofillIgnored(el)
  ) {
    return false;
  }
  if (el.closest("[data-openkey-picker],[data-openkey-icon]")) return false;
  if (el.type === "password") {
    return !isLikelyTokenField(fieldHint(el));
  }
  return isLikelyUsernameField({
    type: el.type,
    autocomplete: fieldAutocomplete(el),
    hint: fieldHint(el),
  });
}

function installAutofillFocus(): void {
  injectNativeAutofillHideStyle();
  document.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target;
      if (!isLoginAutofillTarget(t)) return;
      applyNativeAutofillSuppress(t, { armNow: true });
    },
    true,
  );
  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      if (!isLoginAutofillTarget(t)) return;
      applyNativeAutofillSuppress(t);
      void openLoginAutofill(
        t,
        t.type === "password" ? { passwordField: t } : { usernameField: t },
      );
    },
    true,
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
    applySessionUnlock(!!message.unlocked);
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
          items: entries.map((e) => {
            const visual = pickerVisual(
              { ...e, ...pageArtwork() },
              AUTOFILL_ICON_OPTS,
            );
            return {
              id: e.uuid,
              title: fillUsername(e) || e.title || "Login",
              subtitle:
                field === "password"
                  ? "••••••••"
                  : fillUsername(e) || e.urls?.[0],
              row: "credential" as const,
              icon: "key" as const,
              imageSrc: visual.imageSrc,
              glyphPath: visual.glyphPath,
              backdrop: visual.backdrop,
              masked: field === "password",
            };
          }),
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

watchExtensionSession();
void bootstrapUnlockState();
syncOverlayIcons();
installCaptureListeners();
installAutofillFocus();
const observer = new MutationObserver((mutations) => {
  if (applyingOverlays) return;
  if (!mutationsAffectPageFields(mutations)) return;
  scheduleOverlaySync();
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// SPA navigations / bfcache may leave orphaned overlays behind.
window.addEventListener("pageshow", () => scheduleOverlaySync());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void refreshUnlockState(true).then(() => scheduleOverlaySync());
  }
});
