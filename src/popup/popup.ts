import type {
  DecryptedCard,
  DecryptedCollection,
  DecryptedCrypto,
  DecryptedEntry,
  DecryptedSecret,
  LocaleCode,
  PasswordGenOptions,
  ThemeMode,
} from "../shared/types";
import {
  cardBrandLabel,
  DEFAULT_PASSWORD_GEN,
  fillUsername,
  LOCALES,
  maskAddress,
  maskCardNumber,
  maskSecret,
  secretKindLabel,
} from "../shared/types";
import { generateTotp } from "../shared/totp";
import { copyText } from "../shared/clipboard";
import { vaultEmptyMessage } from "../shared/empty_copy";
import type { InviteRecord, ShareRecord } from "../sync/api";
import type { OrgSummary } from "../background/session";
import {
  buildCardDetailHtml,
  buildCryptoDetailHtml,
  buildLoginDetailHtml,
  buildSecretDetailHtml,
  totpProgress,
  type DetailState,
} from "./details";
import {
  emptyState,
  escapeHtml,
  nextListIndex,
  positionClass,
  skeletonList,
  spacedCardNumber,
} from "./list_utils";
import {
  applyFont,
  applyLocale,
  applyThemeMode,
  buildAppearanceHtml,
  buildAutoLockHtml,
  buildCardEditorHtml,
  buildChangePasswordHtml,
  buildCryptoEditorHtml,
  buildDeleteAccountHtml,
  buildExportHtml,
  buildFaqHtml,
  buildFontsHtml,
  buildGeneratorHtml,
  buildImportHtml,
  buildLanguageHtml,
  buildLoginEditorHtml,
  buildNamePromptHtml,
  buildOrgDetailHtml,
  buildSecretEditorHtml,
  buildServerHtml,
  passwordGenSummary,
  type EditorState,
  type SettingsSub,
} from "./pages";
import type { ExportFormat } from "../shared/import_export";

const lockedHeader = document.getElementById("lockedHeader")!;
const lockedView = document.getElementById("lockedView")!;
const unlockedView = document.getElementById("unlockedView")!;
const errorEl = document.getElementById("error")!;
const listEl = document.getElementById("list")!;
const cardsGrid = document.getElementById("cardsGrid")!;
const settingsPanel = document.getElementById("settingsPanel")!;
const subPanel = document.getElementById("subPanel")!;
const detailPage = document.getElementById("detailPage")!;
const searchEl = document.getElementById("search") as HTMLInputElement;
const searchBar = document.getElementById("searchBar")!;
const pageHeader = document.getElementById("pageHeader")!;
const pageTitle = document.getElementById("pageTitle")!;
const pageActions = document.getElementById("pageActions")!;
const searchToggle = document.getElementById("searchToggle")!;
const leadingBtn = document.getElementById("leadingBtn") as HTMLButtonElement;
const shareToggle = document.getElementById("shareToggle") as HTMLButtonElement;
const navIndicator = document.getElementById("navIndicator")!;
const toastHost = document.getElementById("toastHost")!;
const loadingOverlay = document.getElementById("loadingOverlay")!;
const fabBtn = document.getElementById("fabBtn") as HTMLButtonElement;

type Tab = "vault" | "cards" | "crypto" | "secrets" | "settings";

let tab: Tab = "vault";
let settingsSub: SettingsSub = null;
let searching = false;
let logins: DecryptedEntry[] = [];
let cards: DecryptedCard[] = [];
let wallets: DecryptedCrypto[] = [];
let secrets: DecryptedSecret[] = [];
let collections: DecryptedCollection[] = [];
let currentFolderUuid: string | null = null;
let folderStack: DecryptedCollection[] = [];
let shares: ShareRecord[] = [];
let orgs: OrgSummary[] = [];
let invites: InviteRecord[] = [];
let selectedOrg: OrgSummary | null = null;
let editor: EditorState | null = null;
let detail: DetailState | null = null;
let passwordVisible = false;
let privateKeyVisible = false;
let seedVisible = false;
let secretValueVisible = false;
let secretPassphraseVisible = false;
let cardFlipped = false;
let totpTimer: ReturnType<typeof setInterval> | null = null;
let accountEmail: string | null = null;
let serverUrl = "";
let lockMinutes = 15;
let clipboardClearSeconds = 30;
let themeMode: ThemeMode = "system";
let locale: LocaleCode = "en";
let passwordGen: PasswordGenOptions = { ...DEFAULT_PASSWORD_GEN };
let genPreview = "";
let preferNative = true;
let sessionMode: "standalone" | "native" | null = null;
let highContrast = false;
let fontId = "system";
let sortMode: "name" | "recent" = "name";
let activeTag: string | null = null;
let activeCardBrand: string | null = null;
let activeCryptoNetwork: string | null = null;
let activeSecretKind: string | null = null;
let importFormatHint = "chromeCsv";

const ICONS = {
  key: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12.65 10A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`,
  card: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>`,
  crypto: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V5h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>`,
  sync: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`,
  password: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2 17h20v2H2v-2zm1.15-4.05L4 11.47l.85 1.48 1.3-.75-.85-1.48H7v-1.5H5.3l.85-1.47L4.85 7 4 8.47 3.15 7l-1.3.75.85 1.47H1v1.5h1.7l-.85 1.48 1.3.75zm6.7-.75l1.3.75.85-1.48H14v-1.5h-1.7l.85-1.47L11.85 7 11 8.47 10.15 7l-1.3.75.85 1.47H8v1.5h1.7l-.85 1.48 1.3.75zM23 9.22h-1.7l.85-1.47L20.85 7 20 8.47 19.15 7l-1.3.75.85 1.47H17v1.5h1.7l-.85 1.48 1.3.75.85-1.48.85 1.48 1.3-.75-.85-1.48H23v-1.5z"/></svg>`,
  groups: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>`,
  cloud: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10z"/></svg>`,
  timer: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>`,
  tune: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>`,
  back: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
  info: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
  error: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  person: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
  language: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.987 7.987 0 0 1 5.08 16zm2.95-8H5.08a7.987 7.987 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg>`,
  notes: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 18h12v-2H3v2zM3 6v2h18V6H3zm0 7h18v-2H3v2z"/></svg>`,
  visibility: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`,
  visibilityOff: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>`,
  label: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/></svg>`,
  event: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>`,
  qr: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13-2h-2v3h-3v2h3v3h2v-3h3v-2h-3z"/></svg>`,
  spa: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.55 12c-1.07-.71-2.25-1.27-3.53-1.61 1.28.34 2.46.9 3.53 1.61zm10.43-1.61c-1.29.34-2.49.91-3.57 1.64 1.08-.73 2.28-1.3 3.57-1.64zM15.49 9.83c.19-.11.36-.24.53-.37-1.41.61-2.91 1.01-4.48 1.15.05.02.1.03.15.05 1.23.37 2.35.98 3.27 1.77.08-.1.16-.19.25-.29.48-.54.9-1.14 1.28-1.77v-.02c-.33.18-.66.34-1 .48zm-6.98 0c-.34-.14-.67-.3-1-.48.38.63.8 1.23 1.28 1.77.09.1.17.19.25.29.92-.79 2.04-1.4 3.27-1.77.05-.02.1-.03.15-.05-1.57-.14-3.07-.54-4.48-1.15.17.13.34.26.53.37v.02zM12 5.06c-.66.89-1.14 1.91-1.4 3.01.46-.1.92-.16 1.4-.16s.94.06 1.4.16c-.26-1.1-.74-2.12-1.4-3.01zM12 15.45c-1.83-1.16-3.99-1.84-6.3-1.95C7.96 16.55 9.87 18.43 12 19.5c2.13-1.07 4.04-2.95 6.3-6C15.99 13.61 13.83 14.29 12 15.45z"/></svg>`,
  terminal: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.11-.9-2-2-2zm0 14H4V8h16v10zm-2-1h-6v-2h6v2zM7.5 17l-1.41-1.41L8.67 13l-2.59-2.59L7.5 9l4 4-4 4z"/></svg>`,
};

type ToastKind = "info" | "success" | "warning" | "error";

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let loadingCount = 0;

function showToast(
  message: string,
  kind: ToastKind = "info",
  duration = 2800,
): void {
  if (!message.trim()) return;
  toastHost.innerHTML = "";
  const el = document.createElement("div");
  el.className = `me-toast ${kind}`;
  el.setAttribute("role", "status");
  const icon =
    kind === "success"
      ? ICONS.check
      : kind === "warning"
        ? ICONS.warning
        : kind === "error"
          ? ICONS.error
          : ICONS.info;
  el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg"></span>`;
  el.querySelector(".toast-msg")!.textContent = message;
  el.addEventListener("click", () => dismissToast(el));
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dismissToast(el), duration);
}

function dismissToast(el: HTMLElement): void {
  el.classList.remove("show");
  el.classList.add("hide");
  setTimeout(() => el.remove(), 320);
}

function setLoading(on: boolean): void {
  loadingCount = Math.max(0, loadingCount + (on ? 1 : -1));
  const show = loadingCount > 0;
  loadingOverlay.classList.toggle("show", show);
  loadingOverlay.setAttribute("aria-hidden", show ? "false" : "true");
}

async function copyToClipboard(
  value: string,
  successMsg = "Copied",
): Promise<void> {
  if (!value) return;
  const ms =
    clipboardClearSeconds > 0 ? clipboardClearSeconds * 1000 : 0;
  await copyText(value, { clearAfterMs: ms });
  showToast(successMsg, "success");
}

async function withLoading<T>(fn: () => Promise<T>): Promise<T> {
  setLoading(true);
  try {
    return await fn();
  } finally {
    setLoading(false);
  }
}

async function send<T = Record<string, unknown>>(
  msg: Record<string, unknown>,
): Promise<T> {
  try {
    const res = (await chrome.runtime.sendMessage(msg)) as T | undefined;
    if (chrome.runtime.lastError) {
      return {
        ok: false,
        error: chrome.runtime.lastError.message,
      } as T;
    }
    if (res == null) {
      return {
        ok: false,
        error: "No response from extension background — reload the extension.",
      } as T;
    }
    return res;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    } as T;
  }
}

function showUnlocked(on: boolean) {
  lockedView.hidden = on;
  lockedHeader.hidden = on;
  unlockedView.hidden = !on;
}

function updateNavIndicator() {
  const items = [
    ...document.querySelectorAll<HTMLButtonElement>(".me-nav-item"),
  ];
  const active = items.findIndex((b) => b.classList.contains("active"));
  if (active < 0) return;
  const nav = document.getElementById("bottomNav")!;
  const itemWidth = nav.clientWidth / items.length;
  const pillW = Math.min(64, Math.max(40, itemWidth - 24));
  navIndicator.style.width = `${pillW}px`;
  navIndicator.style.left = `${itemWidth * active + itemWidth / 2 - pillW / 2}px`;
}

function setSearching(on: boolean) {
  searching = on;
  searchBar.hidden = !on;
  pageHeader.hidden = on;
  if (on) {
    searchEl.focus();
  } else {
    searchEl.value = "";
  }
  updatePageChrome();
  render();
}

function stopTotpTimer() {
  if (totpTimer) {
    clearInterval(totpTimer);
    totpTimer = null;
  }
}

function closeDetail() {
  stopTotpTimer();
  detail = null;
  editor = null;
  passwordVisible = false;
  privateKeyVisible = false;
  seedVisible = false;
  secretValueVisible = false;
  secretPassphraseVisible = false;
  cardFlipped = false;
  unlockedView.classList.remove("detail-open");
  detailPage.hidden = true;
  detailPage.innerHTML = "";
  updatePageChrome();
  render();
}

function openDetail(next: DetailState) {
  if (searching) setSearching(false);
  settingsSub = null;
  editor = null;
  stopTotpTimer();
  detail = next;
  passwordVisible = false;
  privateKeyVisible = false;
  seedVisible = false;
  secretValueVisible = false;
  secretPassphraseVisible = false;
  cardFlipped = false;
  unlockedView.classList.add("detail-open");
  void paintDetail();
}

function openSub(sub: SettingsSub) {
  if (searching) setSearching(false);
  detail = null;
  editor = sub === "editor" ? editor : null;
  stopTotpTimer();
  settingsSub = sub;
  unlockedView.classList.remove("detail-open");
  detailPage.hidden = true;
  detailPage.innerHTML = "";
  updatePageChrome();
  render();
}

function openEditor(next: EditorState) {
  if (searching) setSearching(false);
  detail = null;
  stopTotpTimer();
  editor = next;
  settingsSub = "editor";
  unlockedView.classList.remove("detail-open");
  detailPage.hidden = true;
  detailPage.innerHTML = "";
  updatePageChrome();
  render();
}

function updateFab() {
  const nativeBlocksCreate =
    sessionMode === "native" &&
    (tab === "cards" || tab === "crypto" || tab === "secrets");
  const show =
    !detail &&
    !settingsSub &&
    !searching &&
    !nativeBlocksCreate &&
    (tab === "vault" || tab === "cards" || tab === "crypto" || tab === "secrets");
  fabBtn.hidden = !show;
}

function setLeadingBack(handler: () => void) {
  leadingBtn.hidden = false;
  leadingBtn.onclick = handler;
}

function showDetailChrome() {
  setLeadingBack(() => closeDetail());
  searchToggle.hidden = true;
  shareToggle.hidden =
    detail?.kind !== "login" || sessionMode === "native";
  pageActions.hidden = false;
  // Ensure Edit control exists beside share/search.
  let editBtn = document.getElementById("editToggle") as HTMLButtonElement | null;
  if (!editBtn) {
    editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.id = "editToggle";
    editBtn.title = "Edit";
    editBtn.setAttribute("aria-label", "Edit");
    editBtn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>`;
    pageActions.appendChild(editBtn);
  }
  editBtn.hidden = false;
  if (sessionMode === "native" && detail && detail.kind !== "login") {
    // Card / crypto / secret writes are desktop-app only in native mode.
    editBtn.hidden = true;
  }
  const folderBtn = document.getElementById("folderToggle");
  if (folderBtn) (folderBtn as HTMLButtonElement).hidden = true;
  const sortBtn = document.getElementById("sortToggle");
  if (sortBtn) (sortBtn as HTMLButtonElement).hidden = true;
  editBtn.onclick = () => {
    if (!detail) return;
    if (sessionMode === "native" && detail.kind !== "login") {
      showToast("Edit this item in the OpenKey desktop app", "info");
      return;
    }
    if (detail.kind === "login") {
      openEditor({
        kind: "login",
        uuid: detail.entry.uuid,
        collectionUuid: detail.entry.collectionUuid,
        draft: { ...detail.entry },
      });
    } else if (detail.kind === "card") {
      openEditor({
        kind: "card",
        uuid: detail.card.uuid,
        draft: { ...detail.card },
      });
    } else if (detail.kind === "crypto") {
      openEditor({
        kind: "crypto",
        uuid: detail.wallet.uuid,
        draft: { ...detail.wallet },
      });
    } else {
      openEditor({
        kind: "secret",
        uuid: detail.secret.uuid,
        draft: { ...detail.secret },
      });
    }
  };
  shareToggle.onclick = () => {
    const input = detailPage.querySelector("#shareEmail") as HTMLInputElement | null;
    input?.focus();
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
}

function restoreSearchAction() {
  leadingBtn.hidden = true;
  shareToggle.hidden = true;
  searchToggle.hidden = false;
  pageActions.hidden = false;
  const editBtn = document.getElementById("editToggle");
  if (editBtn) editBtn.hidden = true;
  if (!pageActions.contains(searchToggle)) {
    pageActions.prepend(searchToggle);
  }
  if (!pageActions.contains(shareToggle)) {
    pageActions.appendChild(shareToggle);
  }
}

function showSubBackAction() {
  setLeadingBack(() => {
    if (settingsSub === "orgDetail") {
      settingsSub = "orgs";
      selectedOrg = null;
    } else if (settingsSub === "editor") {
      editor = null;
      settingsSub = null;
    } else if (settingsSub === "fonts" || settingsSub === "language") {
      settingsSub = "appearance";
    } else {
      settingsSub = null;
    }
    restoreSearchAction();
    updatePageChrome();
    render();
  });
  searchToggle.hidden = true;
  shareToggle.hidden = true;
  pageActions.hidden = true;
  const folderBtn = document.getElementById("folderToggle");
  if (folderBtn) (folderBtn as HTMLButtonElement).hidden = true;
  const sortBtn = document.getElementById("sortToggle");
  if (sortBtn) (sortBtn as HTMLButtonElement).hidden = true;
}

function updatePageChrome() {
  const titles: Record<Tab, string> = {
    vault: currentFolderUuid
      ? folderStack[folderStack.length - 1]?.name || "Folder"
      : "Vault",
    cards: "Payment cards",
    crypto: "Crypto wallets",
    secrets: "Developer secrets",
    settings: "Settings",
  };
  const placeholders: Record<Tab, string> = {
    vault: "Search passwords",
    cards: "Search cards",
    crypto: "Search crypto wallets",
    secrets: "Search secrets",
    settings: "Search",
  };

  pageHeader.hidden = searching;
  searchBar.hidden = !searching;

  if (detail) {
    if (detail.kind === "login") {
      pageTitle.textContent = detail.entry.title || "Untitled";
    } else if (detail.kind === "card") {
      pageTitle.textContent =
        detail.card.name || cardBrandLabel(detail.card.brand, detail.card.number);
    } else if (detail.kind === "crypto") {
      pageTitle.textContent = detail.wallet.name || detail.wallet.network;
    } else {
      pageTitle.textContent =
        detail.secret.name || secretKindLabel(detail.secret.secretKind);
    }
    showDetailChrome();
    updateFab();
    return;
  }

  const subTitles: Partial<Record<Exclude<SettingsSub, null>, string>> = {
    shares: "Shares",
    orgs: "Organizations",
    orgDetail: selectedOrg?.name || "Organization",
    generator: "Password generator",
    faq: "FAQ",
    appearance: "Appearance",
    fonts: "Fonts",
    autoLock: "Auto-lock",
    import: "Import passwords",
    export: "Export passwords",
    changePassword: "Change master password",
    server: "Server",
    language: "Text direction",
    newFolder: "New folder",
    newOrg: "New organization",
    deleteAccount: "Delete server account",
    editor:
      editor?.kind === "login"
        ? editor.uuid
          ? "Edit login"
          : "New login"
        : editor?.kind === "card"
          ? editor.uuid
            ? "Edit card"
            : "New card"
          : editor?.kind === "crypto"
            ? editor.uuid
              ? "Edit wallet"
              : "New wallet"
            : editor?.uuid
              ? "Edit secret"
              : "New secret",
  };

  if (settingsSub) {
    pageTitle.textContent = subTitles[settingsSub] ?? "Settings";
    showSubBackAction();
    updateFab();
    return;
  }

  if (tab === "vault" && currentFolderUuid) {
    pageTitle.textContent = titles.vault;
    setLeadingBack(() => {
      folderStack = folderStack.slice(0, -1);
      currentFolderUuid =
        folderStack.length > 0
          ? folderStack[folderStack.length - 1]!.uuid
          : null;
      updatePageChrome();
      render();
    });
    searchToggle.hidden = false;
    shareToggle.hidden = true;
    pageActions.hidden = false;
    wireVaultToolbar();
    updateFab();
    searchEl.placeholder = placeholders[tab];
    return;
  }

  pageTitle.textContent = titles[tab];
  restoreSearchAction();
  const showSearch = tab !== "settings";
  pageActions.hidden = !showSearch;
  searchToggle.hidden = !showSearch;
  shareToggle.hidden = true;
  leadingBtn.hidden = true;
  wireVaultToolbar();

  searchEl.placeholder = placeholders[tab];
  updateFab();
}

function wireVaultToolbar() {
  // Folder create + sort affordances on vault.
  let folderBtn = document.getElementById(
    "folderToggle",
  ) as HTMLButtonElement | null;
  if (!folderBtn) {
    folderBtn = document.createElement("button");
    folderBtn.type = "button";
    folderBtn.className = "icon-btn";
    folderBtn.id = "folderToggle";
    folderBtn.title = "New folder";
    folderBtn.setAttribute("aria-label", "New folder");
    folderBtn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z"/></svg>`;
    pageActions.appendChild(folderBtn);
  }
  folderBtn.hidden = tab !== "vault" || sessionMode === "native";
  folderBtn.onclick = () => openSub("newFolder");

  let sortBtn = document.getElementById(
    "sortToggle",
  ) as HTMLButtonElement | null;
  if (!sortBtn) {
    sortBtn = document.createElement("button");
    sortBtn.type = "button";
    sortBtn.className = "icon-btn";
    sortBtn.id = "sortToggle";
    sortBtn.setAttribute("aria-label", "Sort");
    pageActions.appendChild(sortBtn);
  }
  sortBtn.hidden = tab !== "vault";
  sortBtn.title =
    sortMode === "name"
      ? "Sorted by name · tap for recent"
      : "Sorted by recent · tap for name";
  sortBtn.innerHTML =
    sortMode === "name"
      ? `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>`
      : `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 18h12v-2H3v2zM3 6v2h18V6H3zm0 7h6v-2H3v2z"/></svg>`;
  sortBtn.onclick = async () => {
    sortMode = sortMode === "name" ? "recent" : "name";
    await send({ type: "SAVE_SETTINGS", settings: { sortMode } });
    showToast(
      sortMode === "name" ? "Sorted A–Z" : "Sorted by recent",
      "info",
      1600,
    );
    updatePageChrome();
    render();
  };
}

function setTab(next: Tab) {
  tab = next;
  settingsSub = null;
  editor = null;
  selectedOrg = null;
  stopTotpTimer();
  detail = null;
  passwordVisible = false;
  privateKeyVisible = false;
  seedVisible = false;
  secretValueVisible = false;
  secretPassphraseVisible = false;
  cardFlipped = false;
  unlockedView.classList.remove("detail-open");
  detailPage.hidden = true;
  detailPage.innerHTML = "";
  if (next !== "vault") {
    currentFolderUuid = null;
    folderStack = [];
  }
  if (searching) setSearching(false);
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".me-nav-item")) {
    btn.classList.toggle("active", btn.dataset.tab === next);
  }
  updateNavIndicator();
  updatePageChrome();
  render();
}

function clearPanels() {
  listEl.innerHTML = "";
  cardsGrid.innerHTML = "";
  settingsPanel.innerHTML = "";
  subPanel.innerHTML = "";
  listEl.hidden = true;
  cardsGrid.hidden = true;
  settingsPanel.hidden = true;
  subPanel.hidden = true;
  if (!detail) {
    detailPage.hidden = true;
    detailPage.innerHTML = "";
  }
}

function render() {
  if (detail) {
    void paintDetail();
    return;
  }
  clearPanels();
  const q = searchEl.value.trim().toLowerCase();

  if (settingsSub === "shares") {
    renderSharesSub(q);
    return;
  }
  if (settingsSub === "orgs") {
    renderOrgsSub(q);
    return;
  }
  if (settingsSub === "orgDetail" && selectedOrg) {
    renderOrgDetail();
    return;
  }
  if (settingsSub === "generator") {
    renderGeneratorPage();
    return;
  }
  if (settingsSub === "faq") {
    renderFaqPage();
    return;
  }
  if (settingsSub === "appearance") {
    renderAppearancePage();
    return;
  }
  if (settingsSub === "fonts") {
    renderFontsPage();
    return;
  }
  if (settingsSub === "autoLock") {
    renderAutoLockPage();
    return;
  }
  if (settingsSub === "import") {
    renderImportPage();
    return;
  }
  if (settingsSub === "export") {
    renderExportPage();
    return;
  }
  if (settingsSub === "changePassword") {
    renderChangePasswordPage();
    return;
  }
  if (settingsSub === "server") {
    renderServerPage();
    return;
  }
  if (settingsSub === "language") {
    renderLanguagePage();
    return;
  }
  if (settingsSub === "newFolder" || settingsSub === "newOrg") {
    renderNamePromptPage();
    return;
  }
  if (settingsSub === "deleteAccount") {
    renderDeleteAccountPage();
    return;
  }
  if (settingsSub === "editor" && editor) {
    renderEditorPage();
    return;
  }

  if (tab === "vault") renderVault(q);
  else if (tab === "cards") renderCards(q);
  else if (tab === "crypto") renderCrypto(q);
  else if (tab === "secrets") renderSecrets(q);
  else renderSettings();

  wireListKeyboardTargets();
}

function wireListKeyboardTargets(): void {
  listEl.querySelectorAll<HTMLElement>(":scope > li").forEach((li) => {
    if (!li.hasAttribute("tabindex")) li.tabIndex = 0;
    if (!li.getAttribute("role")) li.setAttribute("role", "button");
  });
}

async function paintDetail() {
  if (!detail) return;
  clearPanels();
  detailPage.hidden = false;
  unlockedView.classList.add("detail-open");
  updatePageChrome();

  if (detail.kind === "login") {
    const entry = detail.entry;
    const files =
      sessionMode === "native"
        ? []
        : (
            await send<{
              attachments: Array<{ id: string; name: string; size: number }>;
            }>({ type: "LIST_ATTACHMENTS", entryUuid: entry.uuid })
          ).attachments ??
          entry.attachments ??
          [];
    const period = entry.totp?.period ?? 30;
    const code = entry.totp?.secret ? generateTotp(entry.totp) : null;
    detailPage.innerHTML = buildLoginDetailHtml(entry, {
      escapeHtml,
      icons: ICONS,
      passwordVisible,
      totpCode: code,
      totpProg: entry.totp?.secret ? totpProgress(period) : 0,
      attachments: files,
      allowManage: sessionMode !== "native",
      allowDelete: true,
    });
    wireLoginDetail(entry, files);
    stopTotpTimer();
    if (entry.totp?.secret) {
      totpTimer = setInterval(() => {
        if (!detail || detail.kind !== "login") {
          stopTotpTimer();
          return;
        }
        const el = detailPage.querySelector(".totp-code");
        const bar = detailPage.querySelector(".totp-bar-fill") as HTMLElement | null;
        if (el) el.textContent = generateTotp(detail.entry.totp!);
        if (bar) {
          bar.style.width = `${Math.round(totpProgress(period) * 100)}%`;
        }
      }, 1000);
    }
    return;
  }

  if (detail.kind === "card") {
    detailPage.innerHTML = buildCardDetailHtml(detail.card, {
      escapeHtml,
      icons: ICONS,
    });
    if (cardFlipped) {
      detailPage.querySelector("#detailCreditCard")?.classList.add("flipped");
    }
    wireCardDetail(detail.card);
    return;
  }

  if (detail.kind === "crypto") {
    detailPage.innerHTML = buildCryptoDetailHtml(detail.wallet, {
      escapeHtml,
      icons: ICONS,
      showPrivateKey: privateKeyVisible,
      showSeed: seedVisible,
    });
    wireCryptoDetail(detail.wallet);
    return;
  }

  detailPage.innerHTML = buildSecretDetailHtml(detail.secret, {
    escapeHtml,
    icons: ICONS,
    showSecret: secretValueVisible,
    showPassphrase: secretPassphraseVisible,
  });
  wireSecretDetail(detail.secret);
}

function wireLoginDetail(
  entry: DecryptedEntry,
  files: Array<{ id: string; name: string; size: number }>,
) {
  const copyMap: Record<string, string> = {
    username: fillUsername(entry),
    password: entry.password,
    website: entry.urls[0] ?? "",
    notes: entry.notes ?? "",
  };
  (entry.fields ?? []).forEach((f, i) => {
    copyMap[`field:${i}`] = f.value;
  });

  detailPage.querySelectorAll<HTMLElement>("[data-copy]").forEach((el) => {
    el.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const key = el.dataset.copy!;
      const value = copyMap[key];
      if (!value) return;
      await copyToClipboard(value, "Copied");
    });
  });

  detailPage
    .querySelector('[data-action="toggle-password"]')
    ?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      passwordVisible = !passwordVisible;
      void paintDetail();
    });

  detailPage
    .querySelector('[data-action="copy-username"]')
    ?.addEventListener("click", async () => {
      const u = fillUsername(entry);
      if (!u) return;
      await copyToClipboard(u, "Username copied");
    });

  detailPage
    .querySelector('[data-action="copy-password"]')
    ?.addEventListener("click", async () => {
      if (!entry.password) return;
      await copyToClipboard(entry.password, "Password copied");
    });

  detailPage
    .querySelector('[data-action="fill"]')
    ?.addEventListener("click", async () => {
      if (entry.password) {
        await copyText(entry.password, {
          clearAfterMs:
            clipboardClearSeconds > 0 ? clipboardClearSeconds * 1000 : 0,
        });
      }
      const [active] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (active?.id) {
        try {
          await chrome.tabs.sendMessage(active.id, {
            type: "OPENKEY_FILL",
            entry: {
              ...entry,
              totpCode: entry.totp?.secret ? generateTotp(entry.totp) : undefined,
            },
          });
          showToast("Filled on page", "success");
        } catch {
          showToast("Password copied (page not fillable)", "warning");
        }
      } else {
        showToast("Password copied", "success");
      }
    });

  detailPage
    .querySelector('[data-action="copy-totp"]')
    ?.addEventListener("click", async () => {
      if (!entry.totp?.secret) return;
      const code = generateTotp(entry.totp);
      await copyToClipboard(code, "Authenticator code copied");
    });

  detailPage
    .querySelector('[data-action="share"]')
    ?.addEventListener("click", async () => {
      const email = (
        detailPage.querySelector("#shareEmail") as HTMLInputElement
      ).value.trim();
      if (!email) {
        showToast("Enter recipient email", "warning");
        return;
      }
      const res = await send<{ ok?: boolean; error?: string }>({
        type: "SHARE_ENTRY",
        entryUuid: entry.uuid,
        recipientEmail: email,
      });
      if (res.ok) showToast("Share sent", "success");
      else showToast(res.error ?? "Share failed", "error");
    });

  detailPage
    .querySelectorAll<HTMLButtonElement>("[data-attachment]")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.attachment!;
        const f = files.find((x) => x.id === id);
        const res = await send<{
          ok?: boolean;
          filename?: string;
          bytesB64?: string;
          error?: string;
        }>({
          type: "DOWNLOAD_ATTACHMENT",
          entryUuid: entry.uuid,
          attachmentId: id,
        });
        if (!res.ok || !res.bytesB64) {
          showToast(res.error ?? "Download failed", "error");
          return;
        }
        const bin = Uint8Array.from(atob(res.bytesB64), (c) => c.charCodeAt(0));
        const blob = new Blob([bin]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename || f?.name || "file";
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Saved ${res.filename || f?.name || "file"}`, "success");
      });
    });

  detailPage
    .querySelector('[data-action="move"]')
    ?.addEventListener("click", async () => {
      const names = ["Vault root", ...collections.map((c) => c.name)];
      const choice = prompt(
        `Move to folder:\n${names.map((n, i) => `${i}: ${n}`).join("\n")}`,
        "0",
      );
      if (choice == null) return;
      const idx = Number(choice);
      if (!Number.isFinite(idx) || idx < 0 || idx >= names.length) {
        showToast("Invalid folder", "warning");
        return;
      }
      const collectionUuid = idx === 0 ? null : collections[idx - 1]!.uuid;
      const res = await withLoading(() =>
        send<{ ok?: boolean; error?: string }>({
          type: "MOVE_LOGIN",
          uuid: entry.uuid,
          collectionUuid,
        }),
      );
      if (!res.ok) showToast(res.error ?? "Move failed", "error");
      else {
        showToast("Moved", "success");
        await refresh();
      }
    });

  detailPage
    .querySelector('[data-action="delete"]')
    ?.addEventListener("click", async () => {
      if (!confirm(`Delete "${entry.title || "Untitled"}"?`)) return;
      const res = await withLoading(() =>
        send<{ ok?: boolean; error?: string }>({
          type: "DELETE_ENTRY",
          uuid: entry.uuid,
          kind: "login",
        }),
      );
      if (!res.ok) {
        showToast(res.error ?? "Delete failed", "error");
        return;
      }
      showToast("Deleted", "success");
      closeDetail();
      await refresh();
    });
}

function wireCardDetail(card: DecryptedCard) {
  const copyMap: Record<string, string> = {
    name: card.name,
    holder: card.holder,
    number: card.number,
    expiry: card.expiry,
    cvc: card.cvc,
    notes: card.notes ?? "",
  };

  detailPage.querySelectorAll<HTMLElement>("[data-copy]").forEach((el) => {
    el.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const value = copyMap[el.dataset.copy!];
      if (!value) return;
      await copyToClipboard(value, "Copied");
    });
  });

  detailPage
    .querySelector('[data-action="flip-card"]')
    ?.addEventListener("click", () => {
      cardFlipped = !cardFlipped;
      detailPage
        .querySelector("#detailCreditCard")
        ?.classList.toggle("flipped", cardFlipped);
    });

  detailPage
    .querySelector('[data-action="copy-number"]')
    ?.addEventListener("click", async () => {
      if (!card.number) return;
      await copyToClipboard(card.number, "Card number copied");
    });

  detailPage
    .querySelector('[data-action="copy-cvc"]')
    ?.addEventListener("click", async () => {
      if (!card.cvc) return;
      await copyToClipboard(card.cvc, "CVC copied");
    });

  detailPage
    .querySelector('[data-action="fill-card"]')
    ?.addEventListener("click", async () => {
      if (card.number) {
        await copyText(card.number, {
          clearAfterMs:
            clipboardClearSeconds > 0 ? clipboardClearSeconds * 1000 : 0,
        });
      }
      const [active] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (active?.id) {
        try {
          await chrome.tabs.sendMessage(active.id, {
            type: "OPENKEY_FILL_CARD",
            card,
          });
          showToast("Card filled on page", "success");
        } catch {
          showToast("Card number copied", "success");
        }
      } else {
        showToast("Card number copied", "success");
      }
    });

  detailPage
    .querySelector('[data-action="delete"]')
    ?.addEventListener("click", async () => {
      if (!confirm(`Delete card "${card.name || "Untitled"}"?`)) return;
      const res = await withLoading(() =>
        send<{ ok?: boolean; error?: string }>({
          type: "DELETE_ENTRY",
          uuid: card.uuid,
          kind: "card",
        }),
      );
      if (!res.ok) {
        showToast(res.error ?? "Delete failed", "error");
        return;
      }
      showToast("Deleted", "success");
      closeDetail();
      await refresh();
    });
}

function wireCryptoDetail(wallet: DecryptedCrypto) {
  const copyMap: Record<string, string> = {
    address: wallet.address,
    privateKey: wallet.privateKey ?? "",
    seed: wallet.seedPhrase ?? "",
    notes: wallet.notes ?? "",
  };

  detailPage.querySelectorAll<HTMLElement>("[data-copy]").forEach((el) => {
    el.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const value = copyMap[el.dataset.copy!];
      if (!value) return;
      await copyToClipboard(value, "Copied");
    });
  });

  detailPage
    .querySelector('[data-action="toggle-pk"]')
    ?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      privateKeyVisible = !privateKeyVisible;
      void paintDetail();
    });

  detailPage
    .querySelector('[data-action="toggle-seed"]')
    ?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      seedVisible = !seedVisible;
      void paintDetail();
    });

  detailPage
    .querySelector('[data-action="copy-address"]')
    ?.addEventListener("click", async () => {
      if (!wallet.address) return;
      await copyToClipboard(wallet.address, "Address copied");
    });

  detailPage
    .querySelector('[data-action="delete"]')
    ?.addEventListener("click", async () => {
      if (!confirm(`Delete wallet "${wallet.name || wallet.network}"?`)) return;
      const res = await withLoading(() =>
        send<{ ok?: boolean; error?: string }>({
          type: "DELETE_ENTRY",
          uuid: wallet.uuid,
          kind: "crypto",
        }),
      );
      if (!res.ok) {
        showToast(res.error ?? "Delete failed", "error");
        return;
      }
      showToast("Deleted", "success");
      closeDetail();
      await refresh();
    });
}

function wireSecretDetail(secret: DecryptedSecret) {
  const copyMap: Record<string, string> = {
    host: secret.host,
    username: secret.username,
    publicKey: secret.publicKey,
    secret: secret.secret,
    passphrase: secret.passphrase,
    notes: secret.notes ?? "",
  };

  detailPage.querySelectorAll<HTMLElement>("[data-copy]").forEach((el) => {
    el.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const value = copyMap[el.dataset.copy!];
      if (!value) return;
      await copyToClipboard(value, "Copied");
    });
  });

  detailPage
    .querySelector('[data-action="toggle-secret"]')
    ?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      secretValueVisible = !secretValueVisible;
      void paintDetail();
    });

  detailPage
    .querySelector('[data-action="toggle-passphrase"]')
    ?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      secretPassphraseVisible = !secretPassphraseVisible;
      void paintDetail();
    });

  detailPage
    .querySelector('[data-action="copy-secret"]')
    ?.addEventListener("click", async () => {
      if (!secret.secret) return;
      await copyToClipboard(secret.secret, "Secret copied");
    });

  detailPage
    .querySelector('[data-action="copy-username"]')
    ?.addEventListener("click", async () => {
      if (!secret.username) return;
      await copyToClipboard(secret.username, "Username copied");
    });

  detailPage
    .querySelector('[data-action="fill-secret"]')
    ?.addEventListener("click", async () => {
      if (!secret.secret) return;
      await copyText(secret.secret, {
        clearAfterMs:
          clipboardClearSeconds > 0 ? clipboardClearSeconds * 1000 : 0,
      });
      const [active] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (active?.id) {
        try {
          await chrome.tabs.sendMessage(active.id, {
            type: "OPENKEY_FILL_SECRET",
            secret,
          });
          showToast("Filled on page", "success");
        } catch {
          showToast("Secret copied (page not fillable)", "warning");
        }
      } else {
        showToast("Secret copied", "success");
      }
    });

  detailPage
    .querySelector('[data-action="delete"]')
    ?.addEventListener("click", async () => {
      if (
        !confirm(
          `Delete secret "${secret.name || secretKindLabel(secret.secretKind)}"?`,
        )
      )
        return;
      const res = await withLoading(() =>
        send<{ ok?: boolean; error?: string }>({
          type: "DELETE_ENTRY",
          uuid: secret.uuid,
          kind: "secret",
        }),
      );
      if (!res.ok) {
        showToast(res.error ?? "Delete failed", "error");
        return;
      }
      showToast("Deleted", "success");
      closeDetail();
      await refresh();
    });
}

function renderVault(q: string) {
  listEl.hidden = false;

  const allTags = Array.from(
    new Set(logins.flatMap((e) => e.tags ?? []).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  if (allTags.length && !q) {
    const bar = document.createElement("li");
    bar.className = "pos-alone";
    bar.style.listStyle = "none";
    bar.innerHTML = `<div class="chip-row tag-filter">${[
      `<button type="button" class="me-chip-btn${!activeTag ? " active" : ""}" data-tag="">All</button>`,
      ...allTags.map(
        (t) =>
          `<button type="button" class="me-chip-btn${activeTag === t ? " active" : ""}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`,
      ),
    ].join("")}</div>`;
    bar.querySelectorAll<HTMLButtonElement>("[data-tag]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        activeTag = btn.dataset.tag || null;
        render();
      });
    });
    listEl.appendChild(bar);
  }


  const folders = collections.filter((c) => c.parentUuid === currentFolderUuid);
  const folderMatches = q
    ? folders.filter((c) => c.name.toLowerCase().includes(q))
    : folders;

  const items = logins
    .filter((e) => {
      const inFolder =
        (e.collectionUuid ?? null) === currentFolderUuid ||
        (currentFolderUuid === null &&
          (e.collectionUuid == null ||
            !collections.some((c) => c.uuid === e.collectionUuid)));
      if (!inFolder && !q) return false;
      if (activeTag && !(e.tags ?? []).includes(activeTag) && !q) return false;
      if (q) {
        return (
          e.title.toLowerCase().includes(q) ||
          fillUsername(e).toLowerCase().includes(q) ||
          e.urls.some((u) => u.toLowerCase().includes(q)) ||
          (e.tags ?? []).some((t) => t.toLowerCase().includes(q))
        );
      }
      return inFolder;
    })
    .sort((a, b) => {
      if (sortMode === "recent") return b.revision - a.revision;
      return (a.title || "").localeCompare(b.title || "", undefined, {
        sensitivity: "base",
      });
    });

  // When searching, show matching logins across vault + matching folders.
  const showFolders = !q || folderMatches.length > 0;
  const visibleFolders = q ? folderMatches : folders;

  if (!visibleFolders.length && !items.length) {
    listEl.innerHTML = emptyState(
      ICONS.lock,
      q ? "No matches" : "No passwords yet",
      vaultEmptyMessage({
        tab: "vault",
        searching: !!q,
        filtered: false,
        native: sessionMode === "native",
      }),
    );
    return;
  }

  if (folderStack.length && !q) {
    const crumb = document.createElement("li");
    crumb.className = "pos-alone";
    crumb.style.listStyle = "none";
    crumb.innerHTML = `<div class="breadcrumb">
      <button type="button" data-crumb="root">Vault</button>
      ${folderStack
        .map(
          (f, i) =>
            `<span>/</span><button type="button" data-crumb="${i}">${escapeHtml(f.name)}</button>`,
        )
        .join("")}
    </div>`;
    crumb.querySelectorAll<HTMLButtonElement>("[data-crumb]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const v = btn.dataset.crumb;
        if (v === "root") {
          folderStack = [];
          currentFolderUuid = null;
        } else {
          const idx = Number(v);
          folderStack = folderStack.slice(0, idx + 1);
          currentFolderUuid = folderStack[folderStack.length - 1]?.uuid ?? null;
        }
        updatePageChrome();
        render();
      });
    });
    listEl.appendChild(crumb);
  }

  if (showFolders) {
    visibleFolders.forEach((folder) => {
      const li = document.createElement("li");
      li.className = "folder-row pos-alone";
      li.innerHTML = `
        <div class="item-icon">${ICONS.lock}</div>
        <div class="item-body">
          <div class="item-title">${escapeHtml(folder.name)}</div>
          <div class="item-sub">Folder</div>
        </div>
        <div class="item-trailing">${ICONS.chevron}</div>`;
      li.addEventListener("click", () => {
        folderStack = [...folderStack, folder];
        currentFolderUuid = folder.uuid;
        updatePageChrome();
        render();
      });
      li.addEventListener("contextmenu", async (ev) => {
        ev.preventDefault();
        const choice = prompt(
          `Folder "${folder.name}"\nType rename:<name> or delete`,
        );
        if (!choice) return;
        if (choice.toLowerCase() === "delete") {
          if (!confirm(`Delete folder "${folder.name}"?`)) return;
          const res = await send<{ ok?: boolean; error?: string }>({
            type: "DELETE_FOLDER",
            uuid: folder.uuid,
          });
          if (!res.ok) showToast(res.error ?? "Failed", "error");
          else {
            showToast("Folder deleted", "success");
            if (currentFolderUuid === folder.uuid) {
              folderStack = folderStack.slice(0, -1);
              currentFolderUuid =
                folderStack[folderStack.length - 1]?.uuid ?? null;
            }
            await refresh();
          }
          return;
        }
        if (choice.toLowerCase().startsWith("rename:")) {
          const name = choice.slice(7).trim();
          if (!name) return;
          const res = await send<{ ok?: boolean; error?: string }>({
            type: "RENAME_FOLDER",
            uuid: folder.uuid,
            name,
          });
          if (!res.ok) showToast(res.error ?? "Failed", "error");
          else {
            showToast("Folder renamed", "success");
            await refresh();
          }
        }
      });
      listEl.appendChild(li);
    });
  }

  items.forEach((e, index) => {
    const li = document.createElement("li");
    li.className = positionClass(index, items.length);
    const userLabel = fillUsername(e);
    const badges: string[] = [];
    if (e.totp?.secret != null) badges.push(`TOTP ${generateTotp(e.totp)}`);
    else if (e.passkey) badges.push("Passkey");
    if (e.attachments?.length) {
      badges.push(
        `${e.attachments.length} file${e.attachments.length > 1 ? "s" : ""}`,
      );
    }
    const subParts = [userLabel, ...badges].filter(Boolean);
    li.innerHTML = `
      <div class="item-icon">${ICONS.key}</div>
      <div class="item-body">
        <div class="item-title">${escapeHtml(e.title || "Untitled")}</div>
        <div class="item-sub">${escapeHtml(subParts.join(" · "))}</div>
      </div>
      <div class="item-trailing">
        <button type="button" class="icon-btn copy-btn" title="Copy password" aria-label="Copy password">${ICONS.copy}</button>
      </div>`;

    li.querySelector(".copy-btn")!.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await copyToClipboard(e.password, "Password copied");
    });

    li.addEventListener("click", () => {
      openDetail({ kind: "login", entry: e });
    });
    li.addEventListener("contextmenu", async (ev) => {
      ev.preventDefault();
      const names = [
        "Vault root",
        ...collections.map((c) => c.name),
      ];
      const choice = prompt(
        `Move "${e.title || "Untitled"}" to folder:\n${names.map((n, i) => `${i}: ${n}`).join("\n")}`,
        "0",
      );
      if (choice == null) return;
      const idx = Number(choice);
      if (!Number.isFinite(idx) || idx < 0 || idx >= names.length) {
        showToast("Invalid folder", "warning");
        return;
      }
      const collectionUuid = idx === 0 ? null : collections[idx - 1]!.uuid;
      const res = await send<{ ok?: boolean; error?: string }>({
        type: "MOVE_LOGIN",
        uuid: e.uuid,
        collectionUuid,
      });
      if (!res.ok) showToast(res.error ?? "Move failed", "error");
      else {
        showToast("Moved", "success");
        await refresh();
      }
    });
    listEl.appendChild(li);
  });
}

function renderCards(q: string) {
  cardsGrid.hidden = false;

  const brands = Array.from(
    new Set(
      cards
        .map((c) => cardBrandLabel(c.brand, c.number))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
  if (brands.length && !q) {
    const bar = document.createElement("div");
    bar.className = "chip-row tag-filter";
    bar.innerHTML = [
      `<button type="button" class="me-chip-btn${!activeCardBrand ? " active" : ""}" data-brand="">All</button>`,
      ...brands.map(
        (b) =>
          `<button type="button" class="me-chip-btn${activeCardBrand === b ? " active" : ""}" data-brand="${escapeHtml(b)}">${escapeHtml(b)}</button>`,
      ),
    ].join("");
    bar.querySelectorAll<HTMLButtonElement>("[data-brand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCardBrand = btn.dataset.brand || null;
        render();
      });
    });
    cardsGrid.appendChild(bar);
  }

  const items = cards
    .filter((c) => {
      if (
        activeCardBrand &&
        cardBrandLabel(c.brand, c.number) !== activeCardBrand &&
        !q
      ) {
        return false;
      }
      return (
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.holder.toLowerCase().includes(q) ||
        c.number.includes(q) ||
        cardBrandLabel(c.brand, c.number).toLowerCase().includes(q)
      );
    })
    .sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, {
        sensitivity: "base",
      }),
    );

  if (!items.length) {
    const empty = document.createElement("div");
    empty.innerHTML = emptyState(
      ICONS.card,
      q || activeCardBrand ? "No matches" : "No cards yet",
      vaultEmptyMessage({
        tab: "cards",
        searching: !!q,
        filtered: !!activeCardBrand && !q,
        native: sessionMode === "native",
      }),
    );
    cardsGrid.appendChild(empty);
    return;
  }

  for (const c of items) {
    const brand = cardBrandLabel(c.brand, c.number);
    const masked = maskCardNumber(c.number);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "credit-card";
    btn.innerHTML = `
      <div class="credit-card-top">
        <div class="credit-card-chip" aria-hidden="true"></div>
        <div class="credit-card-brand">${escapeHtml(c.name || brand)}</div>
      </div>
      <div class="credit-card-number">${escapeHtml(spacedCardNumber(masked))}</div>
      <div class="credit-card-bottom">
        <span class="credit-card-holder">${escapeHtml(c.holder || brand)}</span>
        <span>${escapeHtml(c.expiry || "")}</span>
      </div>`;

    btn.addEventListener("click", () => {
      openDetail({ kind: "card", card: c });
    });
    cardsGrid.appendChild(btn);
  }
}

function renderCrypto(q: string) {
  listEl.hidden = false;

  const networks = Array.from(
    new Set(wallets.map((w) => w.network).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  if (networks.length && !q) {
    const bar = document.createElement("li");
    bar.className = "pos-alone";
    bar.style.listStyle = "none";
    bar.innerHTML = `<div class="chip-row tag-filter">${[
      `<button type="button" class="me-chip-btn${!activeCryptoNetwork ? " active" : ""}" data-network="">All</button>`,
      ...networks.map(
        (n) =>
          `<button type="button" class="me-chip-btn${activeCryptoNetwork === n ? " active" : ""}" data-network="${escapeHtml(n)}">${escapeHtml(n)}</button>`,
      ),
    ].join("")}</div>`;
    bar.querySelectorAll<HTMLButtonElement>("[data-network]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        activeCryptoNetwork = btn.dataset.network || null;
        render();
      });
    });
    listEl.appendChild(bar);
  }

  const items = wallets
    .filter((w) => {
      if (activeCryptoNetwork && w.network !== activeCryptoNetwork && !q) {
        return false;
      }
      return (
        !q ||
        w.name.toLowerCase().includes(q) ||
        w.network.toLowerCase().includes(q) ||
        w.address.toLowerCase().includes(q)
      );
    })
    .sort((a, b) =>
      (a.name || a.network).localeCompare(b.name || b.network, undefined, {
        sensitivity: "base",
      }),
    );

  if (!items.length) {
    listEl.innerHTML = emptyState(
      ICONS.crypto,
      q || activeCryptoNetwork ? "No matches" : "No crypto wallets yet",
      vaultEmptyMessage({
        tab: "crypto",
        searching: !!q,
        filtered: !!activeCryptoNetwork && !q,
        native: sessionMode === "native",
      }),
    );
    return;
  }

  items.forEach((w, index) => {
    const li = document.createElement("li");
    li.className = positionClass(index, items.length);
    li.innerHTML = `
      <div class="item-icon tertiary cookie">${ICONS.crypto}</div>
      <div class="item-body">
        <div class="item-title">${escapeHtml(w.name || w.network)}</div>
        <div class="item-sub" style="font-family:ui-monospace,Menlo,monospace">${escapeHtml(w.network)} · ${escapeHtml(maskAddress(w.address))}</div>
      </div>
      <div class="item-trailing">${ICONS.chevron}</div>`;

    li.addEventListener("click", () => {
      openDetail({ kind: "crypto", wallet: w });
    });
    listEl.appendChild(li);
  });
}

function renderSecrets(q: string) {
  listEl.hidden = false;

  const kinds = Array.from(
    new Set(secrets.map((s) => s.secretKind).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  if (kinds.length && !q) {
    const bar = document.createElement("li");
    bar.className = "pos-alone";
    bar.style.listStyle = "none";
    bar.innerHTML = `<div class="chip-row tag-filter">${[
      `<button type="button" class="me-chip-btn${!activeSecretKind ? " active" : ""}" data-kind="">All</button>`,
      ...kinds.map(
        (k) =>
          `<button type="button" class="me-chip-btn${activeSecretKind === k ? " active" : ""}" data-kind="${escapeHtml(k)}">${escapeHtml(secretKindLabel(k))}</button>`,
      ),
    ].join("")}</div>`;
    bar.querySelectorAll<HTMLButtonElement>("[data-kind]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        activeSecretKind = btn.dataset.kind || null;
        render();
      });
    });
    listEl.appendChild(bar);
  }

  const items = secrets
    .filter((s) => {
      if (activeSecretKind && s.secretKind !== activeSecretKind && !q) {
        return false;
      }
      return (
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.host.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        secretKindLabel(s.secretKind).toLowerCase().includes(q) ||
        maskSecret(s.secret).toLowerCase().includes(q)
      );
    })
    .sort((a, b) =>
      (a.name || secretKindLabel(a.secretKind)).localeCompare(
        b.name || secretKindLabel(b.secretKind),
        undefined,
        { sensitivity: "base" },
      ),
    );

  if (!items.length) {
    listEl.innerHTML = emptyState(
      ICONS.terminal,
      q || activeSecretKind ? "No matches" : "No secrets yet",
      vaultEmptyMessage({
        tab: "secrets",
        searching: !!q,
        filtered: !!activeSecretKind && !q,
        native: sessionMode === "native",
      }),
    );
    return;
  }

  items.forEach((s, index) => {
    const li = document.createElement("li");
    li.className = positionClass(index, items.length);
    const sub = [
      secretKindLabel(s.secretKind),
      s.host || s.username || (s.secret ? maskSecret(s.secret) : ""),
    ]
      .filter(Boolean)
      .join(" · ");
    li.innerHTML = `
      <div class="item-icon primary cookie">${ICONS.terminal}</div>
      <div class="item-body">
        <div class="item-title">${escapeHtml(s.name || secretKindLabel(s.secretKind))}</div>
        <div class="item-sub">${escapeHtml(sub)}</div>
      </div>
      <div class="item-trailing">${ICONS.chevron}</div>`;

    li.addEventListener("click", () => {
      secretValueVisible = false;
      secretPassphraseVisible = false;
      openDetail({ kind: "secret", secret: s });
    });
    listEl.appendChild(li);
  });
}

function settingsRow(opts: {
  title: string;
  subtitle?: string;
  icon: string;
  iconClass?: string;
  position: string;
  trailing?: string;
  id?: string;
}): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `action-item ${opts.position}`;
  if (opts.id) btn.dataset.action = opts.id;
  btn.innerHTML = `
    <div class="item-icon cookie ${opts.iconClass ?? "primary"}">${opts.icon}</div>
    <div class="item-body">
      <div class="item-title">${escapeHtml(opts.title)}</div>
      ${opts.subtitle ? `<div class="item-sub">${escapeHtml(opts.subtitle)}</div>` : ""}
    </div>
    <div class="item-trailing">${opts.trailing ?? ICONS.chevron}</div>`;
  return btn;
}

function renderSettings() {
  settingsPanel.hidden = false;
  const localeMeta = LOCALES.find((l) => l.code === locale);
  const isNative = sessionMode === "native";

  const group1 = document.createElement("div");
  group1.className = "settings-group";
  group1.appendChild(
    settingsRow({
      title: isNative
        ? "Desktop app"
        : accountEmail || "Local vault",
      subtitle: isNative
        ? "Connected via native messaging — vault lives in the OpenKey app."
        : "Your vault stays encrypted — only you hold the keys.",
      icon: ICONS.lock,
      iconClass: "primary",
      position: "pos-alone",
      trailing: "",
    }),
  );

  if (isNative) {
    const banner = document.createElement("div");
    banner.className = "me-banner";
    banner.textContent =
      "Sync, shares, organizations, and some edits run in the desktop app while connected this way.";
    settingsPanel.append(group1, banner);
  } else {
    settingsPanel.appendChild(group1);
  }

  const groupAppearance = document.createElement("div");
  groupAppearance.className = "settings-group";
  groupAppearance.appendChild(
    settingsRow({
      title: "Appearance",
      subtitle: `${
        themeMode === "system"
          ? "System"
          : themeMode === "light"
            ? "Light"
            : "Dark"
      } · direction ${localeMeta?.nativeName ?? "English"}`,
      icon: ICONS.tune,
      iconClass: "primary",
      position: "pos-alone",
      id: "appearance",
    }),
  );

  const groupSecurity = document.createElement("div");
  groupSecurity.className = "settings-group";
  const autoLockBtn = settingsRow({
    title: "Auto-lock",
    subtitle: `${lockMinutes} minute${lockMinutes === 1 ? "" : "s"}`,
    icon: ICONS.timer,
    iconClass: "secondary",
    position: isNative ? "pos-alone" : "pos-start",
    id: "autoLock",
  });
  groupSecurity.append(autoLockBtn);
  if (!isNative) {
    const changePwBtn = settingsRow({
      title: "Change master password",
      subtitle: "Re-wrap vault key with a new password",
      icon: ICONS.password,
      iconClass: "primary",
      position: "pos-center",
      id: "changePassword",
    });
    const deleteBtn = settingsRow({
      title: "Delete server account",
      subtitle: "Remove account from self-hosted server",
      icon: ICONS.warning,
      iconClass: "danger",
      position: "pos-end",
      id: "deleteAccount",
    });
    groupSecurity.append(changePwBtn, deleteBtn);
  }

  const groupTools = document.createElement("div");
  groupTools.className = "settings-group";
  const genBtn = settingsRow({
    title: "Password generator",
    subtitle: passwordGenSummary(passwordGen),
    icon: ICONS.password,
    iconClass: "tertiary",
    position: "pos-start",
    id: "generate",
  });
  const faqBtn = settingsRow({
    title: "FAQ",
    subtitle: "Encryption, unlock, sync, and more",
    icon: ICONS.info,
    iconClass: "secondary",
    position: "pos-end",
    id: "faq",
  });
  groupTools.append(genBtn, faqBtn);

  settingsPanel.append(groupAppearance, groupSecurity, groupTools);

  if (!isNative) {
    const groupServer = document.createElement("div");
    groupServer.className = "settings-group";
    const syncBtn = settingsRow({
      title: "Sync",
      subtitle: serverUrl || "Not connected",
      icon: ICONS.sync,
      iconClass: "primary",
      position: "pos-start",
      id: "sync",
    });
    const serverBtn = settingsRow({
      title: "Server",
      subtitle: serverUrl || "Not connected",
      icon: ICONS.cloud,
      iconClass: "primary",
      position: "pos-end",
      id: "server",
    });
    groupServer.append(syncBtn, serverBtn);

    const groupData = document.createElement("div");
    groupData.className = "settings-group";
    const importBtn = settingsRow({
      title: "Import passwords",
      subtitle: "Bitwarden, Chrome, 1Password",
      icon: ICONS.notes,
      iconClass: "secondary",
      position: "pos-start",
      id: "import",
    });
    const exportBtn = settingsRow({
      title: "Export passwords",
      subtitle: "Download decrypted vault",
      icon: ICONS.cloud,
      iconClass: "primary",
      position: "pos-center",
      id: "export",
    });
    const sharesBtn = settingsRow({
      title: "Shares",
      subtitle: shares.length ? `${shares.length} share(s)` : "None",
      icon: ICONS.share,
      iconClass: "tertiary",
      position: "pos-center",
      id: "shares",
    });
    const orgsBtn = settingsRow({
      title: "Organizations",
      subtitle: orgs.length ? `${orgs.length} org(s)` : "None",
      icon: ICONS.groups,
      iconClass: "primary",
      position: "pos-center",
      id: "orgs",
    });
    const identityBtn = settingsRow({
      title: "Publish identity keys",
      subtitle: "Required for sharing & orgs",
      icon: ICONS.key,
      iconClass: "",
      position: "pos-end",
      id: "identity",
    });
    groupData.append(importBtn, exportBtn, sharesBtn, orgsBtn, identityBtn);
    settingsPanel.append(groupServer, groupData);
  } else {
    const groupBridge = document.createElement("div");
    groupBridge.className = "settings-group";
    groupBridge.appendChild(
      settingsRow({
        title: "Server & bridge",
        subtitle: "Prefer desktop bridge and extension ID",
        icon: ICONS.cloud,
        iconClass: "primary",
        position: "pos-alone",
        id: "server",
      }),
    );
    settingsPanel.appendChild(groupBridge);
  }

  const groupLock = document.createElement("div");
  groupLock.className = "settings-group";
  groupLock.appendChild(
    settingsRow({
      title: "Lock vault",
      subtitle: isNative
        ? "Locks this extension session (desktop app stays unlocked)"
        : `Auto-lock · ${lockMinutes} min · clipboard ${clipboardClearSeconds === 0 ? "off" : `${clipboardClearSeconds}s`}`,
      icon: ICONS.lock,
      iconClass: "",
      position: "pos-alone",
      id: "lock",
      trailing: "",
    }),
  );

  settingsPanel.appendChild(groupLock);

  settingsPanel.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(
    (btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action;
        if (action === "sync") {
          const res = await withLoading(() =>
            send<{ ok?: boolean; error?: string }>({ type: "SYNC" }),
          );
          if (!res.ok) {
            showToast(res.error ?? "Sync failed", "error");
            return;
          }
          await refresh();
          showToast("Synced", "success");
        } else if (action === "generate") openSub("generator");
        else if (action === "faq") openSub("faq");
        else if (action === "appearance") openSub("appearance");
        else if (action === "autoLock") openSub("autoLock");
        else if (action === "changePassword") openSub("changePassword");
        else if (action === "deleteAccount") openSub("deleteAccount");
        else if (action === "server") openSub("server");
        else if (action === "import") openSub("import");
        else if (action === "export") openSub("export");
        else if (action === "shares") openSub("shares");
        else if (action === "orgs") openSub("orgs");
        else if (action === "identity") {
          const res = await withLoading(() =>
            send<{ ok?: boolean; error?: string }>({
              type: "PUBLISH_IDENTITY_KEYS",
            }),
          );
          if (!res.ok) showToast(res.error ?? "Failed", "error");
          else showToast("Identity keys published", "success");
        } else if (action === "lock") {
          await send({ type: "LOCK" });
          showToast("Vault locked", "info");
          await refresh();
        }
      });
    },
  );
}

function renderSharesSub(_q: string) {
  subPanel.hidden = false;
  listEl.hidden = false;
  const items = shares;
  if (!items.length) {
    listEl.innerHTML = emptyState(ICONS.share, "No shares", "Shared items will appear here.");
    return;
  }
  items.forEach((s, index) => {
    const li = document.createElement("li");
    li.className = positionClass(index, items.length);
    const label = s.entry_uuid
      ? `Entry ${s.entry_uuid.slice(0, 8)}…`
      : s.collection_uuid
        ? `Collection ${s.collection_uuid.slice(0, 8)}…`
        : s.uuid.slice(0, 8);
    li.innerHTML = `
      <div class="item-icon tertiary">${ICONS.share}</div>
      <div class="item-body">
        <div class="item-title">${escapeHtml(label)}</div>
        <div class="item-sub">${escapeHtml(s.status)} · ${escapeHtml(s.recipient_email || "")}</div>
      </div>`;
    const actions = document.createElement("div");
    actions.className = "inline-actions";
    if (s.status === "pending" && s.encrypted_payload) {
      const accept = document.createElement("button");
      accept.type = "button";
      accept.className = "secondary compact";
      accept.textContent = "Accept";
      accept.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const res = await send<{ ok?: boolean; error?: string }>({
          type: "ACCEPT_SHARE",
          share: s,
        });
        if (res.ok) {
          showToast("Accepted", "success");
          await refresh();
        } else {
          showToast(res.error ?? "Failed", "error");
        }
      });
      actions.appendChild(accept);
    }
    const revoke = document.createElement("button");
    revoke.type = "button";
    revoke.className = "secondary compact";
    revoke.textContent = "Revoke";
    revoke.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const res = await send<{ ok?: boolean; error?: string }>({
        type: "REVOKE_SHARE",
        uuid: s.uuid,
      });
      if (res.ok) {
        showToast("Revoked", "success");
        await refresh();
      } else {
        showToast(res.error ?? "Failed", "error");
      }
    });
    actions.appendChild(revoke);
    li.appendChild(actions);
    listEl.appendChild(li);
  });
}

function renderOrgsSub(q: string) {
  subPanel.hidden = false;
  listEl.hidden = false;

  const create = document.createElement("li");
  create.className = "pos-alone";
  create.innerHTML = `
    <div class="item-icon primary cookie">${ICONS.groups}</div>
    <div class="item-body">
      <div class="item-title">New organization</div>
      <div class="item-sub">Create a shared workspace</div>
    </div>
    <div class="item-trailing">${ICONS.chevron}</div>`;
  create.addEventListener("click", () => openSub("newOrg"));
  listEl.appendChild(create);

  for (const inv of invites) {
    if (q && !String(inv.org_uuid ?? "").toLowerCase().includes(q)) continue;
    const li = document.createElement("li");
    li.className = "pos-alone";
    li.innerHTML = `
      <div class="item-icon primary">${ICONS.groups}</div>
      <div class="item-body">
        <div class="item-title">Invite · ${escapeHtml(inv.role)}</div>
        <div class="item-sub">${escapeHtml(inv.org_uuid || inv.id)}</div>
      </div>`;
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "secondary compact";
    accept.textContent = "Accept invite";
    accept.addEventListener("click", async () => {
      const res = await send<{ ok?: boolean; error?: string }>({
        type: "ACCEPT_INVITE",
        inviteId: inv.id,
      });
      if (res.ok) {
        showToast("Invite accepted", "success");
        await refresh();
      } else {
        showToast(res.error ?? "Failed", "error");
      }
    });
    li.appendChild(accept);
    listEl.appendChild(li);
  }

  const items = orgs.filter(
    (o) =>
      !q ||
      o.name.toLowerCase().includes(q) ||
      o.role.toLowerCase().includes(q),
  );
  if (!items.length && !invites.length) {
    listEl.innerHTML = emptyState(
      ICONS.groups,
      "No organizations",
      "Join or create an org in the OpenKey app.",
    );
    return;
  }
  items.forEach((o, index) => {
    const li = document.createElement("li");
    li.className = positionClass(index, items.length);
    const cols = o.collections.map((c) => c.name).join(", ");
    li.innerHTML = `
      <div class="item-icon primary cookie">${ICONS.groups}</div>
      <div class="item-body">
        <div class="item-title">${escapeHtml(o.name)}</div>
        <div class="item-sub">${escapeHtml(o.role)}${cols ? ` · ${escapeHtml(cols)}` : ""}</div>
      </div>
      <div class="item-trailing">${ICONS.chevron}</div>`;
    li.addEventListener("click", () => {
      selectedOrg = o;
      openSub("orgDetail");
    });
    listEl.appendChild(li);
  });
}

function renderOrgDetail() {
  if (!selectedOrg) return;
  subPanel.hidden = false;
  subPanel.innerHTML = buildOrgDetailHtml(selectedOrg, ICONS, []);
  void (async () => {
    const res = await send<{
      members?: Array<{
        id: string;
        role: string;
        status: string;
        invited_email: string | null;
      }>;
      error?: string;
    }>({ type: "LIST_ORG_MEMBERS", orgUuid: selectedOrg!.uuid });
    if (!selectedOrg) return;
    subPanel.innerHTML = buildOrgDetailHtml(
      selectedOrg,
      ICONS,
      res.members ?? [],
    );
    subPanel
      .querySelector('[data-org-action="invite"]')
      ?.addEventListener("click", async () => {
        const email = prompt("Invite email");
        if (!email?.trim()) return;
        const role = confirm("Make admin? Cancel = member") ? "admin" : "member";
        const r = await withLoading(() =>
          send<{ ok?: boolean; error?: string }>({
            type: "INVITE_ORG_MEMBER",
            orgUuid: selectedOrg!.uuid,
            email: email.trim(),
            role,
          }),
        );
        if (!r.ok) showToast(r.error ?? "Invite failed", "error");
        else {
          showToast("Invite sent", "success");
          renderOrgDetail();
        }
      });
    subPanel
      .querySelector('[data-org-action="add-collection"]')
      ?.addEventListener("click", async () => {
        const name = prompt("Collection name");
        if (!name?.trim()) return;
        const r = await withLoading(() =>
          send<{ ok?: boolean; error?: string; collection?: { uuid: string; name: string } }>({
            type: "CREATE_ORG_COLLECTION",
            orgUuid: selectedOrg!.uuid,
            name: name.trim(),
          }),
        );
        if (!r.ok) showToast(r.error ?? "Failed", "error");
        else {
          showToast("Collection created", "success");
          if (r.collection && selectedOrg) {
            selectedOrg = {
              ...selectedOrg,
              collections: [...selectedOrg.collections, r.collection],
              entries: selectedOrg.entries ?? [],
            };
          }
          await refresh();
          const still = orgs.find((o) => o.uuid === selectedOrg?.uuid);
          if (still) selectedOrg = still;
          renderOrgDetail();
        }
      });
    subPanel
      .querySelectorAll<HTMLButtonElement>("[data-add-org-entry]")
      .forEach((btn) => {
        btn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const collectionUuid = btn.dataset.addOrgEntry;
          if (!collectionUuid || !selectedOrg) return;
          const title = prompt("Login title");
          if (!title?.trim()) return;
          const username = prompt("Username") ?? "";
          const password = prompt("Password") ?? "";
          const r = await withLoading(() =>
            send<{
              ok?: boolean;
              error?: string;
              entry?: { uuid: string; title: string; username: string };
            }>({
              type: "CREATE_ORG_ENTRY",
              orgUuid: selectedOrg!.uuid,
              collectionUuid,
              title: title.trim(),
              username,
              password,
            }),
          );
          if (!r.ok) showToast(r.error ?? "Failed", "error");
          else {
            showToast("Shared login created", "success");
            await refresh();
            const still = orgs.find((o) => o.uuid === selectedOrg?.uuid);
            if (still) selectedOrg = still;
            renderOrgDetail();
          }
        });
      });
    subPanel
      .querySelectorAll<HTMLButtonElement>("[data-delete-org-entry]")
      .forEach((btn) => {
        btn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const entryUuid = btn.dataset.deleteOrgEntry;
          if (!entryUuid || !selectedOrg) return;
          if (!confirm("Delete this shared item?")) return;
          const r = await withLoading(() =>
            send<{ ok?: boolean; error?: string }>({
              type: "DELETE_ORG_ENTRY",
              orgUuid: selectedOrg!.uuid,
              entryUuid,
            }),
          );
          if (!r.ok) showToast(r.error ?? "Failed", "error");
          else {
            showToast("Deleted", "success");
            await refresh();
            const still = orgs.find((o) => o.uuid === selectedOrg?.uuid);
            if (still) selectedOrg = still;
            renderOrgDetail();
          }
        });
      });
    subPanel
      .querySelectorAll<HTMLButtonElement>("[data-remove-member]")
      .forEach((btn) => {
        btn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          const memberId = btn.dataset.removeMember;
          const org = selectedOrg;
          if (!memberId || !org) return;
          if (!confirm("Remove this member?")) return;
          const r = await withLoading(() =>
            send<{ ok?: boolean; error?: string }>({
              type: "REMOVE_ORG_MEMBER",
              orgUuid: org.uuid,
              memberId,
            }),
          );
          if (!r.ok) showToast(r.error ?? "Remove failed", "error");
          else {
            showToast("Member removed", "success");
            renderOrgDetail();
          }
        });
      });
    subPanel
      .querySelector('[data-org-action="leave"]')
      ?.addEventListener("click", async () => {
        const org = selectedOrg;
        if (!org) return;
        if (!confirm(`Leave "${org.name}"?`)) return;
        const r = await withLoading(() =>
          send<{ ok?: boolean; error?: string }>({
            type: "LEAVE_ORG",
            orgUuid: org.uuid,
          }),
        );
        if (!r.ok) showToast(r.error ?? "Leave failed", "error");
        else {
          showToast("Left organization", "success");
          selectedOrg = null;
          openSub("orgs");
          await refresh();
        }
      });
  })();
}

function renderDeleteAccountPage() {
  subPanel.hidden = false;
  subPanel.innerHTML = buildDeleteAccountHtml();
  subPanel
    .querySelector("[data-delete-account]")
    ?.addEventListener("click", async () => {
      const password = (
        document.getElementById("delPassword") as HTMLInputElement
      ).value;
      if (!password) {
        showToast("Enter master password", "warning");
        return;
      }
      if (!confirm("Delete your server account permanently?")) return;
      const res = await withLoading(() =>
        send<{ ok?: boolean; error?: string }>({
          type: "DELETE_ACCOUNT",
          masterPassword: password,
        }),
      );
      if (!res.ok) {
        showToast(res.error ?? "Delete failed", "error");
        return;
      }
      showToast("Server account deleted", "success");
      settingsSub = null;
      await refresh();
    });
}

async function refreshGeneratorPreview(opts?: Partial<PasswordGenOptions>) {
  const next = { ...passwordGen, ...opts };
  const res = await send<{
    password?: string;
    options?: PasswordGenOptions;
  }>({
    type: "GENERATE_PASSWORD",
    options: next,
  });
  if (res.options) passwordGen = res.options;
  genPreview = res.password ?? "";
  return genPreview;
}

function readGenOptionsFromDom(): PasswordGenOptions {
  return {
    length: Number(
      (document.getElementById("genLength") as HTMLInputElement)?.value ??
        passwordGen.length,
    ),
    upper: !!(document.getElementById("genUpper") as HTMLInputElement)?.checked,
    lower: !!(document.getElementById("genLower") as HTMLInputElement)?.checked,
    digits: !!(document.getElementById("genDigits") as HTMLInputElement)
      ?.checked,
    symbols: !!(document.getElementById("genSymbols") as HTMLInputElement)
      ?.checked,
    avoidAmbiguous: !!(document.getElementById("genAvoid") as HTMLInputElement)
      ?.checked,
  };
}

async function persistPasswordGen(opts: PasswordGenOptions) {
  passwordGen = opts;
  await send({
    type: "SAVE_SETTINGS",
    settings: { passwordGen: opts },
  });
}

function renderGeneratorPage() {
  subPanel.hidden = false;
  void (async () => {
    if (!genPreview) await refreshGeneratorPreview();
    subPanel.innerHTML = buildGeneratorHtml(passwordGen, genPreview, ICONS);
    const len = document.getElementById("genLength") as HTMLInputElement | null;
    const label = document.getElementById("genLenLabel");
    const regen = async () => {
      const opts = readGenOptionsFromDom();
      await persistPasswordGen(opts);
      await refreshGeneratorPreview(opts);
      const el = document.getElementById("genPassword");
      if (el) el.textContent = genPreview;
      if (label) label.textContent = String(opts.length);
    };
    len?.addEventListener("input", () => {
      if (label) label.textContent = len.value;
    });
    len?.addEventListener("change", () => void regen());
    subPanel.querySelectorAll<HTMLInputElement>("[id^=gen]").forEach((el) => {
      if (el.type === "checkbox") {
        el.addEventListener("change", () => void regen());
      }
    });
    subPanel
      .querySelector('[data-gen="regen"]')
      ?.addEventListener("click", () => void regen());
    subPanel
      .querySelector('[data-gen="copy"]')
      ?.addEventListener("click", async () => {
        if (!genPreview) await regen();
        await copyToClipboard(genPreview, "Password copied");
      });
  })();
}

function renderFaqPage() {
  subPanel.hidden = false;
  subPanel.innerHTML = buildFaqHtml(ICONS);
}

function renderAppearancePage() {
  subPanel.hidden = false;
  subPanel.innerHTML =
    buildAppearanceHtml(themeMode, ICONS, highContrast) +
    `<div class="section-label">Layout & fonts</div>
     <div class="settings-group">
       <button type="button" class="action-item pos-start" data-open-language>
         <div class="item-icon cookie primary">${ICONS.language}</div>
         <div class="item-body">
           <div class="item-title">Text direction</div>
           <div class="item-sub">${escapeHtml(
             LOCALES.find((l) => l.code === locale)?.nativeName ?? "English",
           )} · layout only</div>
         </div>
         <div class="item-trailing">${ICONS.chevron}</div>
       </button>
       <button type="button" class="action-item pos-end" data-open-fonts>
         <div class="item-icon cookie secondary">${ICONS.notes}</div>
         <div class="item-body">
           <div class="item-title">Fonts</div>
           <div class="item-sub">${escapeHtml(
             fontId === "inter" ? "sans" : fontId,
           )}</div>
         </div>
         <div class="item-trailing">${ICONS.chevron}</div>
       </button>
     </div>`;
  subPanel.querySelectorAll<HTMLButtonElement>("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const mode = btn.dataset.theme as ThemeMode;
      themeMode = mode;
      applyThemeMode(mode);
      await send({ type: "SAVE_SETTINGS", settings: { themeMode: mode } });
      showToast("Theme updated", "success");
      renderAppearancePage();
      updatePageChrome();
    });
  });
  const hc = document.getElementById(
    "highContrastToggle",
  ) as HTMLInputElement | null;
  hc?.addEventListener("change", async () => {
    highContrast = !!hc.checked;
    document.documentElement.classList.toggle("high-contrast", highContrast);
    await send({
      type: "SAVE_SETTINGS",
      settings: { highContrast },
    });
  });
  subPanel
    .querySelector("[data-open-language]")
    ?.addEventListener("click", () => openSub("language"));
  subPanel
    .querySelector("[data-open-fonts]")
    ?.addEventListener("click", () => openSub("fonts"));
}

function renderFontsPage() {
  subPanel.hidden = false;
  subPanel.innerHTML = buildFontsHtml(fontId, ICONS);
  subPanel.querySelectorAll<HTMLButtonElement>("[data-font]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      fontId = btn.dataset.font || "system";
      applyFont(fontId);
      await send({ type: "SAVE_SETTINGS", settings: { font: fontId } });
      showToast("Font updated", "success");
      renderFontsPage();
    });
  });
}

function renderAutoLockPage() {
  subPanel.hidden = false;
  subPanel.innerHTML = buildAutoLockHtml(
    lockMinutes,
    clipboardClearSeconds,
    ICONS,
  );
  const range = document.getElementById(
    "lockMinutesRange",
  ) as HTMLInputElement | null;
  const label = document.getElementById("lockMinLabel");
  const save = async (mins: number) => {
    lockMinutes = Math.max(1, Math.min(120, mins));
    await send({
      type: "SAVE_SETTINGS",
      settings: { lockMinutes },
    });
    if (label) label.textContent = String(lockMinutes);
    showToast(`Auto-lock · ${lockMinutes} min`, "success");
  };
  range?.addEventListener("input", () => {
    if (label) label.textContent = range.value;
  });
  range?.addEventListener("change", () => void save(Number(range.value)));
  subPanel
    .querySelectorAll<HTMLButtonElement>("[data-lock-preset]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const mins = Number(btn.dataset.lockPreset);
        if (range) range.value = String(mins);
        void save(mins).then(() => renderAutoLockPage());
      });
    });

  const clipRange = document.getElementById(
    "clipboardClearRange",
  ) as HTMLInputElement | null;
  const clipLabel = document.getElementById("clipClearLabel");
  const formatClip = (sec: number) =>
    sec === 0 ? "never" : `${sec}s`;
  const saveClip = async (sec: number) => {
    clipboardClearSeconds = Math.max(0, Math.min(120, Math.round(sec)));
    await send({
      type: "SAVE_SETTINGS",
      settings: { clipboardClearSeconds },
    });
    if (clipLabel) clipLabel.textContent = formatClip(clipboardClearSeconds);
    showToast(
      clipboardClearSeconds === 0
        ? "Clipboard clear off"
        : `Clipboard clears after ${clipboardClearSeconds}s`,
      "success",
    );
  };
  clipRange?.addEventListener("input", () => {
    if (clipLabel) clipLabel.textContent = formatClip(Number(clipRange.value));
  });
  clipRange?.addEventListener("change", () =>
    void saveClip(Number(clipRange.value)),
  );
  subPanel
    .querySelectorAll<HTMLButtonElement>("[data-clip-preset]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const sec = Number(btn.dataset.clipPreset);
        if (clipRange) clipRange.value = String(sec);
        void saveClip(sec).then(() => renderAutoLockPage());
      });
    });
}

function renderImportPage() {
  subPanel.hidden = false;
  subPanel.innerHTML = buildImportHtml(ICONS);
  const fileInput = document.getElementById("importFile") as HTMLInputElement;
  subPanel.querySelectorAll<HTMLButtonElement>("[data-import]").forEach((btn) => {
    btn.addEventListener("click", () => {
      importFormatHint = btn.dataset.import || "chromeCsv";
      fileInput.click();
    });
  });
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const res = await withLoading(() =>
        send<{ ok?: boolean; imported?: number; error?: string }>({
          type: "IMPORT_LOGINS",
          raw,
          formatHint: importFormatHint,
        }),
      );
      if (!res.ok) throw new Error(res.error ?? "Import failed");
      showToast(`Imported ${res.imported ?? 0} login(s)`, "success");
      settingsSub = null;
      await refresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      fileInput.value = "";
    }
  };
}

function renderExportPage() {
  subPanel.hidden = false;
  subPanel.innerHTML = buildExportHtml(ICONS);
  subPanel.querySelectorAll<HTMLButtonElement>("[data-export]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const format = (btn.dataset.export || "bitwardenJson") as ExportFormat;
      const res = await withLoading(() =>
        send<{
          ok?: boolean;
          content?: string;
          filename?: string;
          mime?: string;
          error?: string;
        }>({ type: "EXPORT_VAULT", format }),
      );
      if (!res.ok || !res.content || !res.filename) {
        showToast(res.error ?? "Export failed", "error");
        return;
      }
      const blob = new Blob([res.content], {
        type: res.mime || "text/plain",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Export downloaded", "success");
    });
  });
}

function renderChangePasswordPage() {
  subPanel.hidden = false;
  subPanel.innerHTML = buildChangePasswordHtml();
  subPanel
    .querySelector("[data-change-password]")
    ?.addEventListener("click", async () => {
      const current = (
        document.getElementById("pwCurrent") as HTMLInputElement
      ).value;
      const next = (document.getElementById("pwNext") as HTMLInputElement)
        .value;
      const confirm = (
        document.getElementById("pwConfirm") as HTMLInputElement
      ).value;
      if (next !== confirm) {
        showToast("Passwords do not match", "error");
        return;
      }
      const res = await withLoading(() =>
        send<{ ok?: boolean; error?: string }>({
          type: "CHANGE_MASTER_PASSWORD",
          currentPassword: current,
          newPassword: next,
        }),
      );
      if (!res.ok) {
        showToast(res.error ?? "Failed", "error");
        return;
      }
      showToast("Master password updated", "success");
      settingsSub = null;
      updatePageChrome();
      render();
    });
}

function renderServerPage() {
  subPanel.hidden = false;
  subPanel.innerHTML = buildServerHtml(serverUrl, preferNative);
  subPanel
    .querySelector("[data-save-server]")
    ?.addEventListener("click", async () => {
      const url = (
        document.getElementById("serverUrlField") as HTMLInputElement
      ).value
        .trim()
        .replace(/\/$/, "");
      const prefer = !!(
        document.getElementById("preferNativeField") as HTMLInputElement
      )?.checked;
      await send({
        type: "SAVE_SETTINGS",
        settings: { serverUrl: url, preferNativeBridge: prefer },
      });
      serverUrl = url;
      preferNative = prefer;
      showToast("Server settings saved", "success");
    });
  subPanel
    .querySelector("[data-open-options]")
    ?.addEventListener("click", () => chrome.runtime.openOptionsPage());
}

function renderLanguagePage() {
  subPanel.hidden = false;
  subPanel.innerHTML = buildLanguageHtml(locale, ICONS);
  subPanel
    .querySelectorAll<HTMLButtonElement>("[data-locale]")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        locale = (btn.dataset.locale as LocaleCode) || "en";
        applyLocale(locale);
        await send({ type: "SAVE_SETTINGS", settings: { locale } });
        showToast("Language updated", "success");
        renderLanguagePage();
        updatePageChrome();
      });
    });
}

function renderNamePromptPage() {
  subPanel.hidden = false;
  const isFolder = settingsSub === "newFolder";
  subPanel.innerHTML = buildNamePromptHtml(
    isFolder ? "Folder name" : "Organization name",
    isFolder ? "Work, Personal…" : "My team",
    isFolder ? "folder" : "org",
  );
  subPanel
    .querySelector("[data-name-action]")
    ?.addEventListener("click", async () => {
      const name = (
        document.getElementById("namePrompt") as HTMLInputElement
      ).value.trim();
      if (!name) {
        showToast("Name required", "warning");
        return;
      }
      if (isFolder) {
        const res = await withLoading(() =>
          send<{ ok?: boolean; error?: string }>({
            type: "CREATE_FOLDER",
            name,
            parentUuid: currentFolderUuid,
          }),
        );
        if (!res.ok) {
          showToast(res.error ?? "Failed", "error");
          return;
        }
        showToast("Folder created", "success");
        settingsSub = null;
        await refresh();
      } else {
        const res = await withLoading(() =>
          send<{ ok?: boolean; error?: string }>({
            type: "CREATE_ORG",
            name,
          }),
        );
        if (!res.ok) {
          showToast(res.error ?? "Failed", "error");
          return;
        }
        showToast("Organization created", "success");
        openSub("orgs");
        await refresh();
      }
    });
}

function renderEditorPage() {
  if (!editor) return;
  subPanel.hidden = false;
  const isNew = !editor.uuid;
  if (editor.kind === "login") {
    const folderOpts = collections.map((c) => ({
      uuid: c.uuid,
      name: c.name,
    }));
    subPanel.innerHTML = buildLoginEditorHtml(
      editor.draft,
      isNew,
      folderOpts,
      editor.collectionUuid ?? currentFolderUuid,
    );
  } else if (editor.kind === "card") {
    subPanel.innerHTML = buildCardEditorHtml(editor.draft, isNew);
  } else if (editor.kind === "crypto") {
    subPanel.innerHTML = buildCryptoEditorHtml(editor.draft, isNew);
  } else {
    subPanel.innerHTML = buildSecretEditorHtml(editor.draft, isNew);
  }

  subPanel
    .querySelector("[data-editor-save]")
    ?.addEventListener("click", () => void saveEditor());
  subPanel
    .querySelector("[data-editor-delete]")
    ?.addEventListener("click", () => void deleteEditor());
  subPanel
    .querySelector("[data-gen-password]")
    ?.addEventListener("click", async () => {
      const pwd = await refreshGeneratorPreview();
      const input = document.getElementById("edPassword") as HTMLInputElement | null;
      if (input) {
        input.type = "text";
        input.value = pwd;
      }
      showToast("Password generated", "success");
    });
}

async function saveEditor() {
  if (!editor) return;
  const current = editor;
  const val = (id: string) =>
    (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement)
      ?.value ?? "";

  try {
    if (current.kind === "login") {
      const totpSecret = val("edTotp").trim();
      const folderVal = val("edFolder");
      const collectionUuid = folderVal === "" ? null : folderVal;
      const res = await withLoading(() =>
        send<{ ok?: boolean; error?: string; entry?: DecryptedEntry }>({
          type: "UPSERT_LOGIN",
          uuid: current.uuid,
          collectionUuid,
          payload: {
            title: val("edTitle"),
            username: val("edUsername"),
            password: val("edPassword"),
            urls: val("edUrl") ? [val("edUrl")] : [],
            notes: val("edNotes"),
            tags: val("edTags")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            fields: [
              ...(val("edEmail").trim()
                ? [{ type: "email", value: val("edEmail").trim() }]
                : []),
              ...(val("edPhone").trim()
                ? [{ type: "phone", value: val("edPhone").trim() }]
                : []),
              ...(val("edPin").trim()
                ? [{ type: "pin", value: val("edPin").trim() }]
                : []),
            ],
            totp: totpSecret ? { secret: totpSecret } : null,
          },
        }),
      );
      if (!res.ok) throw new Error(res.error ?? "Save failed");
      showToast(current.uuid ? "Login updated" : "Login created", "success");
    } else if (current.kind === "card") {
      const res = await withLoading(() =>
        send<{ ok?: boolean; error?: string }>({
          type: "UPSERT_CARD",
          uuid: current.uuid,
          payload: {
            type: "card",
            name: val("edName"),
            holder: val("edHolder"),
            number: val("edNumber"),
            expiry: val("edExpiry"),
            cvc: val("edCvc"),
            brand: val("edBrand") || undefined,
            notes: val("edNotes") || undefined,
          },
        }),
      );
      if (!res.ok) throw new Error(res.error ?? "Save failed");
      showToast(current.uuid ? "Card updated" : "Card created", "success");
    } else if (current.kind === "crypto") {
      const res = await withLoading(() =>
        send<{ ok?: boolean; error?: string }>({
          type: "UPSERT_CRYPTO",
          uuid: current.uuid,
          payload: {
            type: "crypto",
            name: val("edName"),
            network: val("edNetwork"),
            address: val("edAddress"),
            privateKey: val("edPrivateKey") || undefined,
            seedPhrase: val("edSeed") || undefined,
            notes: val("edNotes") || undefined,
          },
        }),
      );
      if (!res.ok) throw new Error(res.error ?? "Save failed");
      showToast(current.uuid ? "Wallet updated" : "Wallet created", "success");
    } else {
      const res = await withLoading(() =>
        send<{ ok?: boolean; error?: string }>({
          type: "UPSERT_SECRET",
          uuid: current.uuid,
          payload: {
            type: "secret",
            name: val("edName"),
            kind: val("edSecretKind") || "apiToken",
            host: val("edHost"),
            username: val("edUsername"),
            publicKey: val("edPublicKey"),
            secret: val("edSecret"),
            passphrase: val("edPassphrase"),
            notes: val("edNotes"),
          },
        }),
      );
      if (!res.ok) throw new Error(res.error ?? "Save failed");
      showToast(current.uuid ? "Secret updated" : "Secret created", "success");
    }
    editor = null;
    settingsSub = null;
    await refresh();
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e), "error");
  }
}

async function deleteEditor() {
  if (!editor?.uuid) return;
  if (!confirm("Delete this item?")) return;
  const res = await withLoading(() =>
    send<{ ok?: boolean; error?: string }>({
      type: "DELETE_ENTRY",
      uuid: editor!.uuid,
      kind: editor!.kind,
    }),
  );
  if (!res.ok) {
    showToast(res.error ?? "Delete failed", "error");
    return;
  }
  showToast("Deleted", "success");
  editor = null;
  settingsSub = null;
  await refresh();
}

async function refresh() {
  const status = await send<{
    unlocked: boolean;
    mode?: "standalone" | "native" | null;
    email?: string | null;
    settings?: {
      serverUrl?: string;
      lockMinutes?: number;
      clipboardClearSeconds?: number;
      themeMode?: ThemeMode;
      locale?: LocaleCode;
      highContrast?: boolean;
      font?: string;
      sortMode?: "name" | "recent";
      passwordGen?: PasswordGenOptions;
      preferNativeBridge?: boolean;
    };
  }>({ type: "GET_STATUS" });
  showUnlocked(!!status.unlocked);
  if (!status.unlocked) {
    sessionMode = null;
    updateFab();
    return;
  }

  sessionMode = status.mode === "native" ? "native" : "standalone";
  accountEmail = status.email ?? null;
  serverUrl = status.settings?.serverUrl ?? "";
  lockMinutes = status.settings?.lockMinutes ?? 15;
  clipboardClearSeconds = status.settings?.clipboardClearSeconds ?? 30;
  themeMode = status.settings?.themeMode ?? "system";
  locale = status.settings?.locale ?? "en";
  highContrast = !!status.settings?.highContrast;
  fontId = status.settings?.font ?? "system";
  sortMode = status.settings?.sortMode === "recent" ? "recent" : "name";
  document.documentElement.classList.toggle("high-contrast", highContrast);
  preferNative = status.settings?.preferNativeBridge ?? true;
  if (status.settings?.passwordGen) {
    passwordGen = { ...DEFAULT_PASSWORD_GEN, ...status.settings.passwordGen };
  }
  applyThemeMode(themeMode);
  applyLocale(locale);
  applyFont(fontId);

  // Skeleton while vault data loads (ME skeleton feel).
  if (
    tab !== "settings" &&
    !settingsSub &&
    !logins.length &&
    !cards.length &&
    !wallets.length &&
    !secrets.length
  ) {
    clearPanels();
    listEl.hidden = false;
    listEl.innerHTML = skeletonList();
  }

  const [loginRes, cardRes, cryptoRes, secretRes, colRes] = await Promise.all([
    send<{ entries: DecryptedEntry[] }>({ type: "LIST_ENTRIES" }),
    send<{ cards: DecryptedCard[] }>({ type: "LIST_CARDS" }),
    send<{ wallets: DecryptedCrypto[] }>({ type: "LIST_CRYPTO" }),
    send<{ secrets: DecryptedSecret[] }>({ type: "LIST_SECRETS" }),
    send<{ collections: DecryptedCollection[] }>({ type: "LIST_COLLECTIONS" }),
  ]);
  logins = loginRes.entries ?? [];
  cards = cardRes.cards ?? [];
  wallets = cryptoRes.wallets ?? [];
  secrets = secretRes.secrets ?? [];
  collections = colRes.collections ?? [];

  if (sessionMode === "native") {
    shares = [];
    orgs = [];
    invites = [];
  } else {
    try {
      const shareRes = await send<{ shares: ShareRecord[]; error?: string }>({
        type: "LIST_SHARES",
      });
      shares = shareRes.shares ?? [];
    } catch {
      shares = [];
    }
    try {
      const orgRes = await send<{ orgs: OrgSummary[]; error?: string }>({
        type: "LIST_ORGS",
      });
      orgs = orgRes.orgs ?? [];
    } catch {
      orgs = [];
    }
    try {
      const inviteRes = await send<{ invites: InviteRecord[] }>({
        type: "LIST_INVITES",
      });
      invites = inviteRes.invites ?? [];
    } catch {
      invites = [];
    }
  }

  // Keep detail pages in sync with refreshed vault data.
  const open = detail;
  if (open?.kind === "login") {
    const still = logins.find((e) => e.uuid === open.entry.uuid);
    detail = still ? { kind: "login", entry: still } : null;
  } else if (open?.kind === "card") {
    const still = cards.find((c) => c.uuid === open.card.uuid);
    detail = still ? { kind: "card", card: still } : null;
  } else if (open?.kind === "crypto") {
    const still = wallets.find((w) => w.uuid === open.wallet.uuid);
    detail = still ? { kind: "crypto", wallet: still } : null;
  } else if (open?.kind === "secret") {
    const still = secrets.find((s) => s.uuid === open.secret.uuid);
    detail = still ? { kind: "secret", secret: still } : null;
  }
  if (!detail) {
    stopTotpTimer();
    unlockedView.classList.remove("detail-open");
    detailPage.hidden = true;
  }

  updatePageChrome();
  render();
  updateNavIndicator();
}

document.getElementById("unlockBtn")!.addEventListener("click", async () => {
  errorEl.textContent = "";
  const email = (document.getElementById("email") as HTMLInputElement).value;
  const password = (document.getElementById("password") as HTMLInputElement)
    .value;
  const server = (document.getElementById("serverUrl") as HTMLInputElement)
    .value;
  const res = await withLoading(() =>
    send<{ ok?: boolean; error?: string }>({
      type: "UNLOCK",
      email,
      password,
      serverUrl: server,
    }),
  );
  if (!res.ok) {
    errorEl.textContent = res.error ?? "Unlock failed";
    showToast(res.error ?? "Unlock failed", "error");
    return;
  }
  showToast("Vault unlocked", "success");
  await refresh();
});

document.getElementById("registerBtn")!.addEventListener("click", async () => {
  errorEl.textContent = "";
  const email = (document.getElementById("email") as HTMLInputElement).value;
  const password = (document.getElementById("password") as HTMLInputElement)
    .value;
  const confirm = (document.getElementById("confirm") as HTMLInputElement).value;
  const server = (document.getElementById("serverUrl") as HTMLInputElement)
    .value;
  if (password !== confirm) {
    errorEl.textContent = "Passwords do not match";
    showToast("Passwords do not match", "warning");
    return;
  }
  const res = await withLoading(() =>
    send<{ ok?: boolean; error?: string }>({
      type: "REGISTER",
      email,
      password,
      serverUrl: server,
    }),
  );
  if (!res.ok) {
    errorEl.textContent = res.error ?? "Registration failed";
    showToast(res.error ?? "Registration failed", "error");
    return;
  }
  showToast("Account created", "success");
  await refresh();
});

document.getElementById("nativeBtn")!.addEventListener("click", async () => {
  errorEl.textContent = "";
  const res = await withLoading(() =>
    send<{ ok?: boolean; error?: string }>({
      type: "UNLOCK_NATIVE",
    }),
  );
  if (!res.ok) {
    const id = chrome.runtime.id;
    const detail = res.error?.trim() || "Native host not reachable";
    errorEl.textContent =
      `${detail}\n\nExtension ID: ${id}\nOpenKey → Settings → Browser extension → paste ID → Connect. Keep vault unlocked, then retry.`;
    showToast(detail, "error", 4000);
    return;
  }
  showToast("Connected to desktop app", "success");
  await refresh();
});

function setAuthMode(mode: "unlock" | "register") {
  const unlockBtn = document.getElementById("unlockBtn") as HTMLButtonElement;
  const registerBtn = document.getElementById(
    "registerBtn",
  ) as HTMLButtonElement;
  const confirmWrap = document.getElementById("confirmWrap")!;
  const heroSub = document.getElementById("heroSub")!;
  const password = document.getElementById("password") as HTMLInputElement;
  document
    .getElementById("modeUnlock")!
    .classList.toggle("active", mode === "unlock");
  document
    .getElementById("modeRegister")!
    .classList.toggle("active", mode === "register");
  unlockBtn.hidden = mode !== "unlock";
  registerBtn.hidden = mode !== "register";
  confirmWrap.hidden = mode !== "register";
  password.autocomplete =
    mode === "register" ? "new-password" : "current-password";
  heroSub.textContent =
    mode === "register"
      ? "Create an account on your self-hosted server."
      : "Unlock your vault or connect the desktop app.";
}

document.getElementById("modeUnlock")!.addEventListener("click", () => {
  setAuthMode("unlock");
});
document.getElementById("modeRegister")!.addEventListener("click", () => {
  setAuthMode("register");
});

searchToggle.addEventListener("click", () => setSearching(true));
document.getElementById("searchBack")!.addEventListener("click", () => {
  setSearching(false);
});
searchEl.addEventListener("input", () => render());
searchEl.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    setSearching(false);
  }
});

fabBtn.addEventListener("click", () => {
  if (tab === "vault") {
    openEditor({
      kind: "login",
      collectionUuid: currentFolderUuid,
      draft: { title: "", username: "", password: "", urls: [], notes: "" },
    });
  } else if (tab === "cards") {
    openEditor({
      kind: "card",
      draft: {
        type: "card",
        name: "",
        holder: "",
        number: "",
        expiry: "",
        cvc: "",
      },
    });
  } else if (tab === "crypto") {
    openEditor({
      kind: "crypto",
      draft: {
        type: "crypto",
        name: "",
        network: "",
        address: "",
      },
    });
  } else if (tab === "secrets") {
    openEditor({
      kind: "secret",
      draft: {
        type: "secret",
        name: "",
        secretKind: "apiToken",
        username: "",
        host: "",
        publicKey: "",
        secret: "",
        passphrase: "",
        notes: "",
      },
    });
  }
});

for (const btn of document.querySelectorAll<HTMLButtonElement>(".me-nav-item")) {
  btn.addEventListener("click", () => setTab(btn.dataset.tab as Tab));
}

async function bootstrapLocked() {
  setAuthMode("unlock");
  const status = await send<{
    unlocked?: boolean;
    settings?: {
      serverUrl?: string;
      themeMode?: ThemeMode;
      locale?: LocaleCode;
    };
    extensionId?: string;
  }>({ type: "GET_STATUS" });
  const serverInput = document.getElementById("serverUrl") as HTMLInputElement;
  if (status.settings?.serverUrl) {
    serverInput.value = status.settings.serverUrl;
  }
  if (status.settings?.themeMode) {
    themeMode = status.settings.themeMode;
    applyThemeMode(themeMode);
  }
  if (status.settings?.locale) {
    locale = status.settings.locale;
    applyLocale(locale);
  }
  const settings = status.settings as
    | {
        font?: string;
        highContrast?: boolean;
        sortMode?: "name" | "recent";
      }
    | undefined;
  if (settings?.font) {
    fontId = settings.font;
    applyFont(fontId);
  }
  if (settings?.highContrast != null) {
    highContrast = !!settings.highContrast;
    document.documentElement.classList.toggle("high-contrast", highContrast);
  }
  if (settings?.sortMode) sortMode = settings.sortMode;
  const hint = document.getElementById("extIdHint")!;
  const id = status.extensionId || chrome.runtime.id;
  hint.innerHTML = `For desktop fill, paste this ID in OpenKey → Settings → Browser extension:<code>${id}</code>`;
}

void (async () => {
  await bootstrapLocked();
  await refresh();
  requestAnimationFrame(updateNavIndicator);
})();

let touchQueued = false;
function touchSession(): void {
  if (unlockedView.hidden) return;
  if (touchQueued) return;
  touchQueued = true;
  window.setTimeout(() => {
    touchQueued = false;
    void send({ type: "TOUCH_SESSION" });
  }, 1500);
}

unlockedView.addEventListener("pointerdown", touchSession, { passive: true });
unlockedView.addEventListener("keydown", (e) => {
  touchSession();
  if (e.key === "Escape" && searching) {
    e.preventDefault();
    setSearching(false);
    return;
  }
  if (detail || editor || settingsSub) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    return;
  }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
  const items = Array.from(
    listEl.querySelectorAll<HTMLElement>(":scope > li"),
  );
  if (!items.length) return;
  const active = document.activeElement;
  const idx =
    active instanceof HTMLElement && items.includes(active)
      ? items.indexOf(active)
      : -1;
  if (e.key === "Enter") {
    if (idx < 0) return;
    e.preventDefault();
    items[idx]!.click();
    return;
  }
  e.preventDefault();
  const next = nextListIndex(idx, e.key === "ArrowDown" ? 1 : -1, items.length);
  if (next >= 0) items[next]!.focus();
});
