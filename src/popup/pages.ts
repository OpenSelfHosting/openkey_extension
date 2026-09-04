import type {
  DecryptedCard,
  DecryptedCrypto,
  DecryptedEntry,
  DecryptedSecret,
  LocaleCode,
  PasswordGenOptions,
  SecretKindName,
  ThemeMode,
} from "../shared/types";
import { FONT_OPTIONS, LOCALES } from "../shared/types";
import type { OrgSummary } from "../background/session";

export type SettingsSub =
  | null
  | "shares"
  | "orgs"
  | "orgDetail"
  | "generator"
  | "faq"
  | "appearance"
  | "fonts"
  | "autoLock"
  | "editor"
  | "import"
  | "export"
  | "changePassword"
  | "server"
  | "language"
  | "newFolder"
  | "newOrg"
  | "deleteAccount";

export type EditorState =
  | { kind: "login"; uuid?: string; collectionUuid?: string | null; draft: Partial<DecryptedEntry> }
  | { kind: "card"; uuid?: string; draft: Partial<DecryptedCard> }
  | { kind: "crypto"; uuid?: string; draft: Partial<DecryptedCrypto> }
  | { kind: "secret"; uuid?: string; draft: Partial<DecryptedSecret> };

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function field(
  label: string,
  id: string,
  value: string,
  opts?: { type?: string; rows?: number; placeholder?: string },
): string {
  if (opts?.rows) {
    return `<label class="form-label">${esc(label)}
      <textarea id="${id}" rows="${opts.rows}" placeholder="${esc(opts.placeholder ?? "")}">${esc(value)}</textarea>
    </label>`;
  }
  return `<label class="form-label">${esc(label)}
    <input id="${id}" type="${opts?.type ?? "text"}" value="${esc(value)}" placeholder="${esc(opts?.placeholder ?? "")}" autocomplete="off" />
  </label>`;
}

function switchRow(
  title: string,
  subtitle: string,
  id: string,
  checked: boolean,
  position: string,
): string {
  return `<div class="action-item ${position}" data-toggle="${id}" role="button" tabindex="0">
    <div class="item-body">
      <div class="item-title">${esc(title)}</div>
      <div class="item-sub">${esc(subtitle)}</div>
    </div>
    <div class="item-trailing">
      <label class="me-switch" onclick="event.stopPropagation()">
        <input type="checkbox" id="${id}" ${checked ? "checked" : ""} />
        <span class="me-switch-track"></span>
      </label>
    </div>
  </div>`;
}

/** Full password generator page — matches openkey_app PasswordGeneratorPage. */
export function buildGeneratorHtml(
  opts: PasswordGenOptions,
  password: string,
  icons: Record<string, string>,
): string {
  return `
    <div class="sub-page">
      <div class="settings-group">
        <div class="action-item pos-alone">
          <div class="item-icon cookie primary">${icons.lock}</div>
          <div class="item-body">
            <div class="item-title">Generated password</div>
            <div class="item-sub mono wrap" id="genPassword">${esc(password)}</div>
          </div>
        </div>
        <div class="detail-actions" style="margin-top:10px;padding:0 4px 8px">
          <button type="button" class="btn-tonal" data-gen="regen">Regenerate</button>
          <button type="button" class="btn-filled" data-gen="copy">Copy</button>
        </div>
      </div>

      <div class="section-label">Options</div>
      <div class="settings-group">
        <div class="action-item pos-alone">
          <div class="item-body" style="width:100%">
            <div class="item-title">Length · <span id="genLenLabel">${opts.length}</span></div>
            <input id="genLength" type="range" min="8" max="64" value="${opts.length}" class="me-slider" />
          </div>
        </div>
      </div>
      <div class="settings-group">
        ${switchRow("Uppercase", "A–Z", "genUpper", opts.upper, "pos-start")}
        ${switchRow("Lowercase", "a–z", "genLower", opts.lower, "pos-center")}
        ${switchRow("Digits", "0–9", "genDigits", opts.digits, "pos-center")}
        ${switchRow("Symbols", "!@#$%…", "genSymbols", opts.symbols, "pos-center")}
        ${switchRow("Avoid ambiguous", "Skip Il1O0o", "genAvoid", opts.avoidAmbiguous, "pos-end")}
      </div>
    </div>`;
}

/** FAQ accordion — matches openkey_app FaqPage (English strings). */
export function buildFaqHtml(icons: Record<string, string>): string {
  const items: Array<{ q: string; a: string; icon: string }> = [
    {
      icon: icons.lock,
      q: "Is my data encrypted?",
      a: "Yes. OpenKey encrypts your vault end-to-end on this device. Your master password and vault key never leave the device in plaintext.",
    },
    {
      icon: icons.key,
      q: "What if I forget my master password?",
      a: "There is no recovery without your master password. Because encryption is zero-knowledge, OpenKey cannot reset it. Keep a secure backup of your password.",
    },
    {
      icon: icons.cloud,
      q: "Does OpenKey work offline?",
      a: "Yes. Your vault is stored locally and unlocks without a network connection. An optional server is only needed for sync and sharing.",
    },
    {
      icon: icons.sync,
      q: "What is “Use desktop app”?",
      a: "That connects the extension to an unlocked OpenKey desktop app over native messaging. Fill, save, edit, and delete for logins, cards, crypto, secrets, and passkeys go through the app — no master password in the browser. Sync, shares, orgs, and vault folders stay in the desktop app while you are connected this way.",
    },
    {
      icon: icons.timer,
      q: "What does auto-lock do?",
      a: "After a period of inactivity the extension session locks. In desktop-bridge mode this locks the extension only; the desktop app stays unlocked until you lock it there. Copied passwords also clear from the clipboard after a short delay (configurable under Auto-lock).",
    },
    {
      icon: icons.visibility,
      q: "Can I use biometrics?",
      a: "Biometric unlock is available in the OpenKey desktop and mobile apps. The browser extension unlocks with your master password or the desktop bridge.",
    },
    {
      icon: icons.cloud,
      q: "How does sync work?",
      a: "Only ciphertext is sent to your self-hosted server. The server never sees your master password or vault key. Sync is available in standalone unlock mode.",
    },
  ];

  return `<div class="sub-page faq-page">${items
    .map(
      (it, i) => `
    <details class="faq-item" ${i === 0 ? "open" : ""}>
      <summary>
        <span class="item-icon cookie primary">${it.icon}</span>
        <span class="faq-q">${esc(it.q)}</span>
      </summary>
      <p class="faq-a">${esc(it.a)}</p>
    </details>`,
    )
    .join("")}</div>`;
}

/** Appearance page — theme mode + high contrast. */
export function buildAppearanceHtml(
  themeMode: ThemeMode,
  icons: Record<string, string>,
  highContrast = false,
): string {
  const modes: Array<{ id: ThemeMode; title: string; sub: string }> = [
    { id: "system", title: "System", sub: "Follow browser preference" },
    { id: "light", title: "Light", sub: "Always light" },
    { id: "dark", title: "Dark", sub: "Always dark" },
  ];
  return `
    <div class="sub-page">
      <div class="section-label">Theme</div>
      <div class="settings-group">
        ${modes
          .map((m, i) => {
            const pos =
              modes.length === 1
                ? "pos-alone"
                : i === 0
                  ? "pos-start"
                  : i === modes.length - 1
                    ? "pos-end"
                    : "pos-center";
            const selected = themeMode === m.id;
            return `<button type="button" class="action-item ${pos}" data-theme="${m.id}">
              <div class="item-icon cookie ${selected ? "primary" : ""}">${icons.tune}</div>
              <div class="item-body">
                <div class="item-title">${esc(m.title)}</div>
                <div class="item-sub">${esc(m.sub)}</div>
              </div>
              <div class="item-trailing">${selected ? icons.check : ""}</div>
            </button>`;
          })
          .join("")}
      </div>
      <div class="section-label">Accessibility</div>
      <div class="settings-group">
        ${switchRow(
          "High contrast",
          "Stronger borders and text",
          "highContrastToggle",
          highContrast,
          "pos-alone",
        )}
      </div>
    </div>`;
}

/** Font picker — subset of openkey_app FontsPage (web-safe stacks). */
export function buildFontsHtml(
  fontId: string,
  icons: Record<string, string>,
): string {
  return `
    <div class="sub-page">
      <div class="settings-group">
        ${FONT_OPTIONS.map((f, i) => {
          const pos =
            FONT_OPTIONS.length === 1
              ? "pos-alone"
              : i === 0
                ? "pos-start"
                : i === FONT_OPTIONS.length - 1
                  ? "pos-end"
                  : "pos-center";
          const selected =
            fontId === f.id || (fontId === "inter" && f.id === "sans");
          return `<button type="button" class="action-item ${pos}" data-font="${f.id}">
            <div class="item-icon cookie ${selected ? "primary" : ""}">${icons.notes}</div>
            <div class="item-body">
              <div class="item-title" style="font-family:${esc(f.css)}">${esc(f.title)}</div>
              <div class="item-sub">${esc(f.subtitle)}</div>
            </div>
            <div class="item-trailing">${selected ? icons.check : ""}</div>
          </button>`;
        }).join("")}
      </div>
      <p class="meta-line">Full custom font assets ship with the OpenKey app.</p>
    </div>`;
}

/** Auto-lock timeout page. */
export function buildAutoLockHtml(
  lockMinutes: number,
  clipboardClearSeconds: number,
  icons: Record<string, string>,
): string {
  const presets = [1, 5, 15, 30, 60, 120];
  const clearPresets = [0, 15, 30, 60, 120];
  return `
    <div class="sub-page">
      <div class="settings-group">
        <div class="action-item pos-alone">
          <div class="item-icon cookie secondary">${icons.timer}</div>
          <div class="item-body" style="width:100%">
            <div class="item-title">Auto-lock · <span id="lockMinLabel">${lockMinutes}</span> min</div>
            <input id="lockMinutesRange" type="range" min="1" max="120" value="${lockMinutes}" class="me-slider" />
          </div>
        </div>
      </div>
      <div class="section-label">Presets</div>
      <div class="chip-row">
        ${presets
          .map(
            (p) =>
              `<button type="button" class="me-chip-btn${p === lockMinutes ? " active" : ""}" data-lock-preset="${p}">${p} min</button>`,
          )
          .join("")}
      </div>
      <div class="section-label" style="margin-top:16px">Clipboard clear</div>
      <div class="settings-group">
        <div class="action-item pos-alone">
          <div class="item-icon cookie secondary">${icons.key}</div>
          <div class="item-body" style="width:100%">
            <div class="item-title">Clear copied secrets after <span id="clipClearLabel">${clipboardClearSeconds === 0 ? "never" : `${clipboardClearSeconds}s`}</span></div>
            <input id="clipboardClearRange" type="range" min="0" max="120" step="5" value="${clipboardClearSeconds}" class="me-slider" />
          </div>
        </div>
      </div>
      <div class="chip-row">
        ${clearPresets
          .map(
            (p) =>
              `<button type="button" class="me-chip-btn${p === clipboardClearSeconds ? " active" : ""}" data-clip-preset="${p}">${p === 0 ? "Off" : `${p}s`}</button>`,
          )
          .join("")}
      </div>
    </div>`;
}

export function buildOrgDetailHtml(
  org: OrgSummary,
  icons: Record<string, string>,
  members: Array<{
    id: string;
    role: string;
    status: string;
    invited_email: string | null;
  }> = [],
): string {
  const cols = org.collections ?? [];
  const entries = org.entries ?? [];
  const isAdmin = org.role === "owner" || org.role === "admin";
  const colRows = cols.length
    ? cols
        .map((c, i) => {
          const pos =
            cols.length === 1
              ? "pos-alone"
              : i === 0
                ? "pos-start"
                : i === cols.length - 1
                  ? "pos-end"
                  : "pos-center";
          const items = entries.filter((e) => e.collectionUuid === c.uuid);
          const itemHtml = items.length
            ? items
                .map(
                  (e) => `<div class="item-sub org-entry-row" style="margin-top:4px;display:flex;align-items:center;gap:6px">
              <span class="org-entry-icon" style="display:inline-flex;opacity:.85">${icons.key}</span>
              <span style="flex:1;min-width:0">${esc(e.title)}${e.username ? ` · ${esc(e.username)}` : ""}</span>
              <button type="button" class="icon-btn" data-delete-org-entry="${esc(e.uuid)}" title="Delete" aria-label="Delete">${icons.close ?? "×"}</button>
            </div>`,
                )
                .join("")
            : `<div class="item-sub" style="margin-top:4px">No shared items yet</div>`;
          return `<div class="action-item ${pos}">
            <div class="item-icon cookie">${icons.lock}</div>
            <div class="item-body">
              <div class="item-title">${esc(c.name)}</div>
              ${itemHtml}
              <button type="button" class="btn-tonal" style="margin-top:8px" data-add-org-entry="${esc(c.uuid)}">Add login</button>
            </div>
          </div>`;
        })
        .join("")
    : `<div class="empty-state"><div class="empty-msg">No shared collections</div></div>`;

  const memberRows = members.length
    ? members
        .map((m, i) => {
          const pos =
            members.length === 1
              ? "pos-alone"
              : i === 0
                ? "pos-start"
                : i === members.length - 1
                  ? "pos-end"
                  : "pos-center";
          const email = m.invited_email || "Member";
          const sub = `${m.role}${m.status === "invited" ? " · pending" : ""}`;
          const canRemove = isAdmin && m.role !== "owner";
          return `<div class="action-item ${pos}">
            <div class="item-icon cookie">${icons.person}</div>
            <div class="item-body">
              <div class="item-title">${esc(email)}</div>
              <div class="item-sub">${esc(sub)}</div>
            </div>
            ${
              canRemove
                ? `<div class="item-trailing"><button type="button" class="icon-btn" data-remove-member="${esc(m.id)}" title="Remove" aria-label="Remove">${icons.close ?? "×"}</button></div>`
                : ""
            }
          </div>`;
        })
        .join("")
    : `<div class="empty-state"><div class="empty-msg">No members loaded</div></div>`;

  const canLeave = org.role !== "owner";

  return `
    <div class="sub-page">
      <div class="detail-hero">
        <div class="detail-avatar primary cookie">${icons.groups}</div>
        <h3 class="detail-name">${esc(org.name)}</h3>
        <span class="me-chip">${esc(org.role)}</span>
        ${
          isAdmin
            ? `<div class="detail-actions" style="margin-top:12px">
          <button type="button" class="btn-tonal" data-org-action="invite">Invite</button>
          <button type="button" class="btn-filled" data-org-action="add-collection">Add collection</button>
        </div>`
            : ""
        }
      </div>
      <div class="section-label">Members</div>
      <div class="settings-group">${memberRows}</div>
      <div class="section-label">Collections</div>
      <div class="settings-group">${colRows}</div>
      ${
        canLeave
          ? `<div class="detail-actions" style="margin-top:16px">
        <button type="button" class="btn-tonal full danger" data-org-action="leave">Leave organization</button>
      </div>`
          : `<p class="meta-line">Owners cannot leave — transfer ownership in the OpenKey app first.</p>`
      }
    </div>`;
}

export function buildLoginEditorHtml(
  draft: Partial<DecryptedEntry>,
  isNew: boolean,
  folders: Array<{ uuid: string; name: string }> = [],
  collectionUuid: string | null = null,
): string {
  const tags = (draft.tags ?? []).join(", ");
  const extras = draft.fields ?? [];
  const email =
    extras.find((f) => f.type.toLowerCase() === "email")?.value ?? "";
  const phone =
    extras.find((f) => f.type.toLowerCase() === "phone")?.value ?? "";
  const pin =
    extras.find((f) => f.type.toLowerCase() === "pin")?.value ?? "";
  const selectedFolder =
    collectionUuid === undefined || collectionUuid === null
      ? ""
      : collectionUuid;
  const folderOptions = [
    `<option value=""${!selectedFolder ? " selected" : ""}>No folder (vault root)</option>`,
    ...folders.map(
      (f) =>
        `<option value="${esc(f.uuid)}"${selectedFolder === f.uuid ? " selected" : ""}>${esc(f.name)}</option>`,
    ),
  ].join("");
  return `
    <div class="sub-page editor-page">
      ${field("Title", "edTitle", draft.title ?? "", { placeholder: "Website or app" })}
      ${field("Username", "edUsername", draft.username ?? "", { placeholder: "email or username" })}
      <label class="form-label">Password
        <div class="input-with-action">
          <input id="edPassword" type="password" value="${esc(draft.password ?? "")}" autocomplete="off" />
          <button type="button" class="icon-btn" data-gen-password title="Generate password">⟳</button>
        </div>
      </label>
      ${field("Website", "edUrl", draft.urls?.[0] ?? "", { type: "url", placeholder: "https://" })}
      <label class="form-label">Folder
        <select id="edFolder">${folderOptions}</select>
      </label>
      ${field("Email", "edEmail", email, { type: "email" })}
      ${field("Phone", "edPhone", phone)}
      ${field("PIN", "edPin", pin, { type: "password" })}
      ${field("Tags", "edTags", tags, { placeholder: "work, banking…" })}
      ${field("Notes", "edNotes", draft.notes ?? "", { rows: 3 })}
      ${field("TOTP secret", "edTotp", draft.totp?.secret ?? "", { placeholder: "optional" })}
      <div class="detail-actions" style="margin-top:12px">
        <button type="button" class="btn-filled full" data-editor-save>${isNew ? "Create" : "Save"}</button>
        ${!isNew ? `<button type="button" class="btn-tonal full danger" data-editor-delete style="margin-top:8px">Delete</button>` : ""}
      </div>
    </div>`;
}

export function buildCardEditorHtml(
  draft: Partial<DecryptedCard>,
  isNew: boolean,
): string {
  return `
    <div class="sub-page editor-page">
      ${field("Card name", "edName", draft.name ?? "")}
      ${field("Cardholder", "edHolder", draft.holder ?? "")}
      ${field("Number", "edNumber", draft.number ?? "", { placeholder: "•••• •••• •••• ••••" })}
      ${field("Expiry", "edExpiry", draft.expiry ?? "", { placeholder: "MM/YY" })}
      ${field("CVC", "edCvc", draft.cvc ?? "", { type: "password" })}
      ${field("Brand", "edBrand", draft.brand ?? "", { placeholder: "visa, mastercard…" })}
      ${field("Bank", "edBank", draft.bank ?? "", { placeholder: "issuer / folder" })}
      ${field("Notes", "edNotes", draft.notes ?? "", { rows: 2 })}
      <div class="detail-actions" style="margin-top:12px">
        <button type="button" class="btn-filled full" data-editor-save>${isNew ? "Create" : "Save"}</button>
        ${!isNew ? `<button type="button" class="btn-tonal full danger" data-editor-delete style="margin-top:8px">Delete</button>` : ""}
      </div>
    </div>`;
}

export function buildCryptoEditorHtml(
  draft: Partial<DecryptedCrypto>,
  isNew: boolean,
): string {
  return `
    <div class="sub-page editor-page">
      ${field("Name", "edName", draft.name ?? "")}
      ${field("Network", "edNetwork", draft.network ?? "", { placeholder: "Bitcoin, Ethereum…" })}
      ${field("Address", "edAddress", draft.address ?? "")}
      ${field("Private key", "edPrivateKey", draft.privateKey ?? "", { rows: 2 })}
      ${field("Seed phrase", "edSeed", draft.seedPhrase ?? "", { rows: 2 })}
      ${field("Folder", "edWalletFolder", draft.folder ?? "", { placeholder: "Cold storage…" })}
      ${field("Notes", "edNotes", draft.notes ?? "", { rows: 2 })}
      <div class="detail-actions" style="margin-top:12px">
        <button type="button" class="btn-filled full" data-editor-save>${isNew ? "Create" : "Save"}</button>
        ${!isNew ? `<button type="button" class="btn-tonal full danger" data-editor-delete style="margin-top:8px">Delete</button>` : ""}
      </div>
    </div>`;
}

export function buildSecretEditorHtml(
  draft: Partial<DecryptedSecret>,
  isNew: boolean,
): string {
  const kind = (draft.secretKind ?? "apiToken") as SecretKindName;
  const kinds: Array<{ id: SecretKindName; label: string }> = [
    { id: "apiToken", label: "API token" },
    { id: "sshKey", label: "SSH key" },
    { id: "envSnippet", label: ".env" },
    { id: "other", label: "Other" },
  ];
  const options = kinds
    .map(
      (k) =>
        `<option value="${k.id}"${kind === k.id ? " selected" : ""}>${k.label}</option>`,
    )
    .join("");
  return `
    <div class="sub-page editor-page">
      ${field("Name", "edName", draft.name ?? "", { placeholder: "GitHub PAT, deploy key…" })}
      <label class="form-label">Kind
        <select id="edSecretKind">${options}</select>
      </label>
      ${field("Host", "edHost", draft.host ?? "", { placeholder: "github.com" })}
      ${field("Username", "edUsername", draft.username ?? "")}
      ${field("Public key", "edPublicKey", draft.publicKey ?? "", { rows: 2, placeholder: "SSH only" })}
      ${field("Secret / token / private key", "edSecret", draft.secret ?? "", { rows: 3 })}
      ${field("Passphrase", "edPassphrase", draft.passphrase ?? "", { type: "password" })}
      ${field("Device", "edDevice", draft.device ?? "", { placeholder: "laptop, CI…" })}
      ${field("Notes", "edNotes", draft.notes ?? "", { rows: 2 })}
      <div class="detail-actions" style="margin-top:12px">
        <button type="button" class="btn-filled full" data-editor-save>${isNew ? "Create" : "Save"}</button>
        ${!isNew ? `<button type="button" class="btn-tonal full danger" data-editor-delete style="margin-top:8px">Delete</button>` : ""}
      </div>
    </div>`;
}

export function buildDeleteAccountHtml(): string {
  return `
    <div class="sub-page editor-page">
      <div class="me-banner danger">
        Deletes your server account and sync ciphertext. Local vault data stays until you clear the extension.
      </div>
      ${field("Master password", "delPassword", "", { type: "password" })}
      <div class="detail-actions" style="margin-top:12px">
        <button type="button" class="btn-filled full danger" data-delete-account>Delete server account</button>
      </div>
    </div>`;
}

export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }
}

export function applyLocale(code: LocaleCode): void {
  const meta = LOCALES.find((l) => l.code === code);
  document.documentElement.lang = code;
  document.documentElement.dir = meta?.rtl ? "rtl" : "ltr";
}

export function applyFont(fontId: string): void {
  const mapped = fontId === "inter" ? "sans" : fontId;
  const opt = FONT_OPTIONS.find((f) => f.id === mapped) ?? FONT_OPTIONS[0]!;
  document.documentElement.style.setProperty("--font", opt.css);
}

export function passwordGenSummary(opts: PasswordGenOptions): string {
  const parts = [
    opts.upper ? "A-Z" : null,
    opts.lower ? "a-z" : null,
    opts.digits ? "0-9" : null,
    opts.symbols ? "!@#" : null,
  ].filter(Boolean);
  return `${opts.length} · ${parts.join(" · ")}`;
}

export function buildImportHtml(icons: Record<string, string>): string {
  return `
    <div class="sub-page">
      <p class="meta-line">Import logins from Bitwarden JSON, Chrome CSV, LastPass CSV, or 1Password CSV.</p>
      <div class="settings-group">
        <button type="button" class="action-item pos-start" data-import="bitwardenJson">
          <div class="item-icon cookie primary">${icons.notes}</div>
          <div class="item-body">
            <div class="item-title">Bitwarden JSON</div>
            <div class="item-sub">.json export</div>
          </div>
          <div class="item-trailing">${icons.chevron}</div>
        </button>
        <button type="button" class="action-item pos-center" data-import="chromeCsv">
          <div class="item-icon cookie secondary">${icons.notes}</div>
          <div class="item-body">
            <div class="item-title">Chrome CSV</div>
            <div class="item-sub">name, url, username, password</div>
          </div>
          <div class="item-trailing">${icons.chevron}</div>
        </button>
        <button type="button" class="action-item pos-center" data-import="lastPassCsv">
          <div class="item-icon cookie tertiary">${icons.notes}</div>
          <div class="item-body">
            <div class="item-title">LastPass CSV</div>
            <div class="item-sub">url, name, grouping, totp, extra</div>
          </div>
          <div class="item-trailing">${icons.chevron}</div>
        </button>
        <button type="button" class="action-item pos-end" data-import="onePasswordCsv">
          <div class="item-icon cookie tertiary">${icons.notes}</div>
          <div class="item-body">
            <div class="item-title">1Password CSV</div>
            <div class="item-sub">Includes otpauth column</div>
          </div>
          <div class="item-trailing">${icons.chevron}</div>
        </button>
      </div>
      <input id="importFile" type="file" accept=".json,.csv,text/csv,application/json" hidden />
    </div>`;
}

export function buildExportHtml(icons: Record<string, string>): string {
  return `
    <div class="sub-page">
      <p class="meta-line">Download decrypted logins. Keep the file private.</p>
      <div class="settings-group">
        <button type="button" class="action-item pos-start" data-export="bitwardenJson">
          <div class="item-icon cookie primary">${icons.cloud}</div>
          <div class="item-body">
            <div class="item-title">Bitwarden JSON</div>
            <div class="item-sub">Folders + logins</div>
          </div>
          <div class="item-trailing">${icons.chevron}</div>
        </button>
        <button type="button" class="action-item pos-center" data-export="chromeCsv">
          <div class="item-icon cookie secondary">${icons.cloud}</div>
          <div class="item-body">
            <div class="item-title">Chrome CSV</div>
            <div class="item-sub">Compatible with Chrome passwords</div>
          </div>
          <div class="item-trailing">${icons.chevron}</div>
        </button>
        <button type="button" class="action-item pos-end" data-export="onePasswordCsv">
          <div class="item-icon cookie tertiary">${icons.cloud}</div>
          <div class="item-body">
            <div class="item-title">1Password CSV</div>
            <div class="item-sub">Includes TOTP otpauth</div>
          </div>
          <div class="item-trailing">${icons.chevron}</div>
        </button>
      </div>
    </div>`;
}

export function buildChangePasswordHtml(): string {
  return `
    <div class="sub-page editor-page">
      <p class="meta-line">Re-wraps your vault key. The vault key itself does not change.</p>
      ${field("Current master password", "pwCurrent", "", { type: "password" })}
      ${field("New master password", "pwNext", "", { type: "password" })}
      ${field("Confirm new password", "pwConfirm", "", { type: "password" })}
      <div class="detail-actions" style="margin-top:12px">
        <button type="button" class="btn-filled full" data-change-password>Change password</button>
      </div>
    </div>`;
}

export function buildServerHtml(
  serverUrl: string,
  preferNative: boolean,
): string {
  return `
    <div class="sub-page editor-page">
      ${field("Self-hosted server URL", "serverUrlField", serverUrl, {
        type: "url",
        placeholder: "http://localhost:8000",
      })}
      <div class="settings-group" style="margin-top:12px">
        ${switchRow(
          "Prefer desktop bridge",
          "Auto-route saves to the unlocked desktop app when available",
          "preferNativeField",
          preferNative,
          "pos-alone",
        )}
      </div>
      <div class="detail-actions" style="margin-top:12px">
        <button type="button" class="btn-filled full" data-save-server>Save</button>
        <button type="button" class="btn-tonal full" data-open-options style="margin-top:8px">Open full options</button>
      </div>
    </div>`;
}

export function buildLanguageHtml(
  locale: LocaleCode,
  icons: Record<string, string>,
): string {
  return `
    <div class="sub-page">
      <p class="meta-line">Chooses text direction (LTR/RTL) for this popup. Full UI translations ship with the OpenKey desktop app.</p>
      <div class="settings-group">
        ${LOCALES.map((l, i) => {
          const pos =
            LOCALES.length === 1
              ? "pos-alone"
              : i === 0
                ? "pos-start"
                : i === LOCALES.length - 1
                  ? "pos-end"
                  : "pos-center";
          const selected = locale === l.code;
          return `<button type="button" class="action-item ${pos}" data-locale="${l.code}">
            <div class="item-icon cookie ${selected ? "primary" : ""}">${icons.language}</div>
            <div class="item-body">
              <div class="item-title">${esc(l.nativeName)}</div>
              <div class="item-sub">${esc(l.englishName)}${l.rtl ? " · RTL" : ""}</div>
            </div>
            <div class="item-trailing">${selected ? icons.check : ""}</div>
          </button>`;
        }).join("")}
      </div>
    </div>`;
}

export function buildNamePromptHtml(
  label: string,
  placeholder: string,
  action: string,
): string {
  return `
    <div class="sub-page editor-page">
      ${field(label, "namePrompt", "", { placeholder })}
      <div class="detail-actions" style="margin-top:12px">
        <button type="button" class="btn-filled full" data-name-action="${action}">Create</button>
      </div>
    </div>`;
}
