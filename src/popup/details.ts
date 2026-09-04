import type {
  DecryptedCard,
  DecryptedCrypto,
  DecryptedEntry,
  DecryptedSecret,
} from "../shared/types";
import {
  cardBrandLabel,
  fillUsername,
  maskAddress,
  maskCardNumber,
  maskSecret,
  secretKindLabel,
} from "../shared/types";
import { generateTotp } from "../shared/totp";
import { entryIconHtml } from "../shared/entry_icon";

export type DetailKind = "login" | "card" | "crypto" | "secret";

export type DetailState =
  | { kind: "login"; entry: DecryptedEntry }
  | { kind: "card"; card: DecryptedCard }
  | { kind: "crypto"; wallet: DecryptedCrypto }
  | { kind: "secret"; secret: DecryptedSecret };

export type DetailCallbacks = {
  escapeHtml: (s: string) => string;
  positionClass: (index: number, length: number) => string;
  icons: Record<string, string>;
  send: <T = Record<string, unknown>>(
    msg: Record<string, unknown>,
  ) => Promise<T>;
  showToast: (
    message: string,
    kind?: "info" | "success" | "warning" | "error",
    duration?: number,
  ) => void;
  onClose: () => void;
};

function spacedNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i += 4) {
    parts.push(digits.slice(i, i + 4) || "");
  }
  return parts.filter(Boolean).join("  ") || "••••  ••••  ••••  ••••";
}

function maskDots(len: number, min = 8, max = 24): string {
  return "•".repeat(Math.min(max, Math.max(min, len || min)));
}

function totpProgress(period: number): number {
  const p = period <= 0 ? 30 : period;
  const now = Math.floor(Date.now() / 1000);
  const remaining = p - (now % p);
  return remaining / p;
}

function fieldRow(opts: {
  title: string;
  value: string;
  icon: string;
  iconClass?: string;
  position: string;
  mono?: boolean;
  multiline?: boolean;
  copyLabel?: string;
  trailingHtml?: string;
  dataCopy?: string;
  dataAction?: string;
}): string {
  const valueHtml = opts.value
    ? `<div class="item-sub${opts.mono ? " mono" : ""}${opts.multiline ? " wrap" : ""}">${opts.value}</div>`
    : `<div class="item-sub">—</div>`;
  const trailing = opts.trailingHtml ?? "";
  // Use <div> — nested <button> inside <button> is invalid HTML and browsers
  // hoist trailing icon buttons outside the row (breaks ActionItem layout).
  return `<div class="action-item ${opts.position}" role="button" tabindex="0" ${opts.dataCopy ? `data-copy="${opts.dataCopy}"` : ""} ${opts.dataAction ? `data-action="${opts.dataAction}"` : ""}>
    <div class="item-icon cookie ${opts.iconClass ?? ""}">${opts.icon}</div>
    <div class="item-body">
      <div class="item-title">${opts.title}</div>
      ${valueHtml}
    </div>
    <div class="item-trailing">${trailing}</div>
  </div>`;
}

export function buildLoginDetailHtml(
  entry: DecryptedEntry,
  opts: {
    escapeHtml: (s: string) => string;
    icons: Record<string, string>;
    passwordVisible: boolean;
    totpCode: string | null;
    totpProg: number;
    attachments: Array<{ id: string; name: string; size: number }>;
    /** When false, hide share / attachments / move (native bridge limits). */
    allowManage?: boolean;
    /** When true, show delete even if allowManage is false (native login delete). */
    allowDelete?: boolean;
  },
): string {
  const { escapeHtml: esc, icons } = opts;
  const allowManage = opts.allowManage !== false;
  const allowDelete = opts.allowDelete !== false;
  const title = entry.title || "Untitled";
  const username = fillUsername(entry);
  const website = entry.urls[0] ?? "";
  const pwdDisplay = entry.password
    ? opts.passwordVisible
      ? esc(entry.password)
      : maskDots(entry.password.length)
    : "—";

  const credRows: string[] = [];
  const hasNotes = !!entry.notes?.trim();
  const hasWebsite = !!website;
  credRows.push(
    fieldRow({
      title: "Username",
      value: esc(username || "—"),
      icon: icons.person,
      iconClass: "",
      position: "pos-start",
      dataCopy: username ? "username" : undefined,
      trailingHtml: username
        ? `<button type="button" class="icon-btn copy-field" data-copy="username" title="Copy">${icons.copy}</button>`
        : "",
    }),
  );
  credRows.push(
    fieldRow({
      title: "Password",
      value: pwdDisplay,
      icon: icons.lock,
      iconClass: "primary",
      position: hasWebsite || hasNotes ? "pos-center" : "pos-end",
      mono: true,
      trailingHtml: entry.password
        ? `<button type="button" class="icon-btn" data-action="toggle-password" title="Show/hide">${opts.passwordVisible ? icons.visibilityOff : icons.visibility}</button>
           <button type="button" class="icon-btn copy-field" data-copy="password" title="Copy">${icons.copy}</button>`
        : "",
      dataCopy: entry.password ? "password" : undefined,
    }),
  );
  if (hasWebsite) {
    credRows.push(
      fieldRow({
        title: "Website",
        value: esc(website),
        icon: icons.language,
        iconClass: "tertiary",
        position: hasNotes ? "pos-center" : "pos-end",
        multiline: true,
        dataCopy: "website",
        trailingHtml: `<button type="button" class="icon-btn copy-field" data-copy="website" title="Copy">${icons.copy}</button>`,
      }),
    );
  }
  if (hasNotes) {
    credRows.push(
      fieldRow({
        title: "Notes",
        value: esc(entry.notes),
        icon: icons.notes,
        iconClass: "highest",
        position: "pos-end",
        multiline: true,
        dataCopy: "notes",
        trailingHtml: `<button type="button" class="icon-btn copy-field" data-copy="notes" title="Copy">${icons.copy}</button>`,
      }),
    );
  }

  const extras = (entry.fields ?? []).filter((f) => f.value?.trim());
  const extraRows = extras.map((f, i) => {
    const sensitive = ["pin", "password", "secret", "token"].includes(
      f.type.toLowerCase(),
    );
    return fieldRow({
      title: esc(f.type),
      value: sensitive
        ? maskDots(f.value.length, 6, 20)
        : esc(f.value),
      icon: icons.notes,
      position:
        extras.length === 1
          ? "pos-alone"
          : i === 0
            ? "pos-start"
            : i === extras.length - 1
              ? "pos-end"
              : "pos-center",
      mono: sensitive,
      dataCopy: `field:${i}`,
      trailingHtml: `<button type="button" class="icon-btn copy-field" data-copy="field:${i}" title="Copy">${icons.copy}</button>`,
    });
  });

  const hasTotp = !!entry.totp?.secret;
  const attachmentsHtml = opts.attachments.length
    ? opts.attachments
        .map(
          (f) =>
            `<button type="button" class="secondary file-btn" data-attachment="${esc(f.id)}">⬇ ${esc(f.name)} (${Math.round(f.size / 1024)} KB)</button>`,
        )
        .join("")
    : `<div class="item-sub" style="padding:8px 4px">No attachments</div>`;

  return `
    <div class="detail-page">
      <div class="detail-hero">
        ${entryIconHtml(entry, { className: "detail-avatar primary cookie", size: 44, preferSiteArtwork: true })}
        <h3 class="detail-name">${esc(title)}</h3>
        ${username ? `<p class="detail-sub">${esc(username)}</p>` : ""}
        <div class="detail-actions">
          <button type="button" class="btn-tonal" data-action="copy-username" ${username ? "" : "disabled"}>Copy username</button>
          <button type="button" class="btn-filled" data-action="copy-password" ${entry.password ? "" : "disabled"}>Copy</button>
        </div>
        <button type="button" class="btn-tonal full" data-action="fill">Fill on page</button>
      </div>

      <div class="section-label">Credentials</div>
      <div class="settings-group">${credRows.join("")}</div>

      ${
        extras.length
          ? `<div class="section-label">Additional fields</div><div class="settings-group">${extraRows.join("")}</div>`
          : ""
      }

      ${
        hasTotp
          ? `<div class="section-label">Authenticator</div>
             <div class="totp-card" role="button" tabindex="0" data-action="copy-totp">
               <div class="totp-row">
                 <span class="totp-code">${esc(opts.totpCode ?? "------")}</span>
                 <button type="button" class="icon-btn" data-action="copy-totp" title="Copy">${icons.copy}</button>
               </div>
               <div class="totp-bar"><div class="totp-bar-fill" style="width:${Math.round(opts.totpProg * 100)}%"></div></div>
               <div class="item-sub">Tap to copy</div>
             </div>`
          : ""
      }

      ${entry.passkey ? `<div class="section-label">Passkey</div><div class="chip-row"><span class="me-chip">Passkey · ${esc(entry.passkey.rpId || "webauthn")}</span></div>` : ""}

      ${(entry.tags ?? []).length ? `<div class="section-label">Tags</div><div class="chip-row">${(entry.tags ?? []).map((t) => `<span class="me-chip">${esc(t)}</span>`).join("")}</div>` : ""}

      ${
        allowManage
          ? `<div class="section-label">Share</div>
      <div class="share-box">
        <input id="shareEmail" type="email" placeholder="email@example.com" />
        <button type="button" class="btn-filled" data-action="share">Share</button>
      </div>

      <div class="section-label">Attachments</div>
      <div class="files">${attachmentsHtml}</div>

      <div class="section-label">Manage</div>
      <div class="detail-actions" style="padding:0 4px 8px">
        <button type="button" class="btn-tonal" data-action="move">Move to folder</button>
        <button type="button" class="btn-tonal danger" data-action="delete">Delete</button>
      </div>`
          : allowDelete
            ? `<div class="me-banner" style="margin:12px 4px">Share, attachments, and folders are available in the OpenKey desktop app.</div>
      <div class="section-label">Manage</div>
      <div class="detail-actions" style="padding:0 4px 8px">
        <button type="button" class="btn-tonal danger" data-action="delete">Delete</button>
      </div>`
            : `<div class="me-banner" style="margin:12px 4px">Share, attachments, and delete are available in the OpenKey desktop app.</div>`
      }

      <p class="meta-line">Revision ${entry.revision}</p>
    </div>`;
}

export function buildCardDetailHtml(
  card: DecryptedCard,
  opts: { escapeHtml: (s: string) => string; icons: Record<string, string> },
): string {
  const { escapeHtml: esc, icons } = opts;
  const brand = cardBrandLabel(card.brand, card.number);
  const name = card.name || brand;

  const rows = [
    fieldRow({
      title: "Card name",
      value: esc(card.name || "—"),
      icon: icons.label,
      position: "pos-start",
      dataCopy: card.name ? "name" : undefined,
    }),
    fieldRow({
      title: "Cardholder",
      value: esc(card.holder || "—"),
      icon: icons.person,
      iconClass: "tertiary",
      position: "pos-center",
      dataCopy: card.holder ? "holder" : undefined,
      trailingHtml: card.holder
        ? `<button type="button" class="icon-btn copy-field" data-copy="holder">${icons.copy}</button>`
        : "",
    }),
    fieldRow({
      title: "Number",
      value: esc(card.number ? spacedNumber(card.number) : "—"),
      icon: icons.card,
      iconClass: "primary",
      position: "pos-center",
      mono: true,
      dataCopy: card.number ? "number" : undefined,
      trailingHtml: card.number
        ? `<button type="button" class="icon-btn copy-field" data-copy="number">${icons.copy}</button>`
        : "",
    }),
    fieldRow({
      title: "Expiry",
      value: esc(card.expiry || "—"),
      icon: icons.event,
      position: "pos-center",
      dataCopy: card.expiry ? "expiry" : undefined,
    }),
    fieldRow({
      title: "CVC",
      value: esc(card.cvc || "—"),
      icon: icons.password,
      iconClass: "danger",
      position: card.bank || card.notes ? "pos-center" : "pos-end",
      mono: true,
      dataCopy: card.cvc ? "cvc" : undefined,
      trailingHtml: card.cvc
        ? `<button type="button" class="icon-btn copy-field" data-copy="cvc">${icons.copy}</button>`
        : "",
    }),
  ];
  if (card.bank) {
    rows.push(
      fieldRow({
        title: "Bank",
        value: esc(card.bank),
        icon: icons.folder ?? icons.label,
        iconClass: "tertiary",
        position: card.notes ? "pos-center" : "pos-end",
        dataCopy: "bank",
      }),
    );
  }
  if (card.notes) {
    rows.push(
      fieldRow({
        title: "Notes",
        value: esc(card.notes),
        icon: icons.notes,
        iconClass: "highest",
        position: "pos-end",
        multiline: true,
        dataCopy: "notes",
      }),
    );
  }

  return `
    <div class="detail-page">
      <div class="detail-hero">
        <button type="button" class="credit-card detail-credit-card" data-action="flip-card" id="detailCreditCard">
          <div class="credit-card-face front">
            <div class="credit-card-top">
              <div class="credit-card-chip"></div>
              <div class="credit-card-brand">${esc(brand)}</div>
            </div>
            <div class="credit-card-number">${esc(spacedNumber(card.number || "0000000000000000"))}</div>
            <div class="credit-card-bottom">
              <span class="credit-card-holder">${esc(card.holder || name)}</span>
              <span>${esc(card.expiry || "••/••")}</span>
            </div>
          </div>
          <div class="credit-card-face back">
            <div class="magstripe"></div>
            <div class="cvc-row">
              <div class="cvc-pad"></div>
              <div class="cvc-box">${esc(card.cvc || "•••")}</div>
            </div>
            <div class="item-sub" style="padding:0 16px;color:var(--on-primary-container)">Tap to flip back</div>
          </div>
        </button>
        <p class="detail-sub">Tap card to flip</p>
        <div class="detail-actions">
          <button type="button" class="btn-tonal" data-action="copy-number" ${card.number ? "" : "disabled"}>Copy number</button>
          <button type="button" class="btn-filled" data-action="copy-cvc" ${card.cvc ? "" : "disabled"}>Copy CVC</button>
        </div>
        <button type="button" class="btn-tonal full" data-action="fill-card" style="margin-top:8px">Fill on page</button>
      </div>

      <div class="section-label">Card details</div>
      <div class="settings-group">${rows.join("")}</div>
      <div class="section-label">Manage</div>
      <div class="detail-actions" style="padding:0 4px 8px">
        <button type="button" class="btn-tonal danger" data-action="delete">Delete</button>
      </div>
      <p class="meta-line">${esc(brand)} · ${esc(maskCardNumber(card.number))} · Revision ${card.revision}</p>
    </div>`;
}

export function buildCryptoDetailHtml(
  wallet: DecryptedCrypto,
  opts: {
    escapeHtml: (s: string) => string;
    icons: Record<string, string>;
    showPrivateKey: boolean;
    showSeed: boolean;
  },
): string {
  const { escapeHtml: esc, icons } = opts;
  const name = wallet.name || wallet.network;
  const pk = wallet.privateKey || "";
  const seed = wallet.seedPhrase || "";

  const rows = [
    fieldRow({
      title: "Address",
      value: esc(wallet.address || "—"),
      icon: icons.qr,
      iconClass: "primary",
      position: "pos-start",
      mono: true,
      multiline: true,
      dataCopy: wallet.address ? "address" : undefined,
      trailingHtml: wallet.address
        ? `<button type="button" class="icon-btn copy-field" data-copy="address">${icons.copy}</button>`
        : "",
    }),
    fieldRow({
      title: "Private key",
      value: pk
        ? opts.showPrivateKey
          ? esc(pk)
          : maskDots(pk.length, 12, 32)
        : "—",
      icon: icons.key,
      iconClass: "danger",
      position: "pos-center",
      mono: true,
      multiline: true,
      dataCopy: pk ? "privateKey" : undefined,
      trailingHtml: pk
        ? `<button type="button" class="icon-btn" data-action="toggle-pk">${opts.showPrivateKey ? icons.visibilityOff : icons.visibility}</button>
           <button type="button" class="icon-btn copy-field" data-copy="privateKey">${icons.copy}</button>`
        : "",
    }),
    fieldRow({
      title: "Seed phrase",
      value: seed
        ? opts.showSeed
          ? esc(seed)
          : "•••• •••• •••• ••••"
        : "—",
      icon: icons.spa,
      iconClass: "tertiary",
      position: wallet.folder || wallet.notes ? "pos-center" : "pos-end",
      mono: true,
      multiline: true,
      dataCopy: seed ? "seed" : undefined,
      trailingHtml: seed
        ? `<button type="button" class="icon-btn" data-action="toggle-seed">${opts.showSeed ? icons.visibilityOff : icons.visibility}</button>
           <button type="button" class="icon-btn copy-field" data-copy="seed">${icons.copy}</button>`
        : "",
    }),
  ];
  if (wallet.folder) {
    rows.push(
      fieldRow({
        title: "Folder",
        value: esc(wallet.folder),
        icon: icons.folder ?? icons.label,
        iconClass: "tertiary",
        position: wallet.notes ? "pos-center" : "pos-end",
        dataCopy: "folder",
      }),
    );
  }
  if (wallet.notes) {
    rows.push(
      fieldRow({
        title: "Notes",
        value: esc(wallet.notes),
        icon: icons.notes,
        iconClass: "highest",
        position: "pos-end",
        multiline: true,
        dataCopy: "notes",
      }),
    );
  }

  return `
    <div class="detail-page">
      <div class="detail-hero">
        <div class="detail-avatar tertiary cookie">${icons.crypto}</div>
        <h3 class="detail-name">${esc(name)}</h3>
        <span class="me-chip">${esc(wallet.network)}${wallet.address ? ` · ${esc(maskAddress(wallet.address))}` : ""}</span>
        <div class="detail-actions" style="margin-top:12px">
          <button type="button" class="btn-filled full" data-action="copy-address" ${wallet.address ? "" : "disabled"}>Copy address</button>
        </div>
      </div>

      <div class="section-label">Crypto details</div>
      <div class="settings-group">${rows.join("")}</div>
      <div class="section-label">Manage</div>
      <div class="detail-actions" style="padding:0 4px 8px">
        <button type="button" class="btn-tonal danger" data-action="delete">Delete</button>
      </div>
      <p class="meta-line">Revision ${wallet.revision}</p>
    </div>`;
}

export function buildSecretDetailHtml(
  secret: DecryptedSecret,
  opts: {
    escapeHtml: (s: string) => string;
    icons: Record<string, string>;
    showSecret: boolean;
    showPassphrase: boolean;
  },
): string {
  const { escapeHtml: esc, icons } = opts;
  const kindLabel = secretKindLabel(secret.secretKind);
  const name = secret.name || kindLabel;
  const value = secret.secret || "";
  const pass = secret.passphrase || "";
  const isEnv = secret.secretKind === "envSnippet";
  const isSsh = secret.secretKind === "sshKey";

  const rows: string[] = [];
  if (secret.device) {
    rows.push(
      fieldRow({
        title: "Device",
        value: esc(secret.device),
        icon: icons.devices ?? icons.label,
        iconClass: "tertiary",
        position: "pos-start",
        dataCopy: "device",
      }),
    );
  }
  if (secret.host) {
    rows.push(
      fieldRow({
        title: "Host",
        value: esc(secret.host),
        icon: icons.language,
        iconClass: "tertiary",
        position: "pos-start",
        dataCopy: "host",
        trailingHtml: `<button type="button" class="icon-btn copy-field" data-copy="host">${icons.copy}</button>`,
      }),
    );
  }
  if (secret.username) {
    rows.push(
      fieldRow({
        title: "Username",
        value: esc(secret.username),
        icon: icons.person,
        position: rows.length ? "pos-center" : "pos-start",
        dataCopy: "username",
        trailingHtml: `<button type="button" class="icon-btn copy-field" data-copy="username">${icons.copy}</button>`,
      }),
    );
  }
  if (isSsh && secret.publicKey) {
    rows.push(
      fieldRow({
        title: "Public key",
        value: esc(secret.publicKey),
        icon: icons.key,
        iconClass: "primary",
        position: "pos-center",
        mono: true,
        multiline: true,
        dataCopy: "publicKey",
        trailingHtml: `<button type="button" class="icon-btn copy-field" data-copy="publicKey">${icons.copy}</button>`,
      }),
    );
  }
  rows.push(
    fieldRow({
      title: isEnv ? ".env body" : isSsh ? "Private key" : "Token / secret",
      value: value
        ? opts.showSecret
          ? esc(value)
          : maskDots(value.length, 12, 32)
        : "—",
      icon: icons.lock,
      iconClass: "danger",
      position: pass || secret.notes ? "pos-center" : "pos-end",
      mono: true,
      multiline: true,
      dataCopy: value ? "secret" : undefined,
      trailingHtml: value
        ? `<button type="button" class="icon-btn" data-action="toggle-secret">${opts.showSecret ? icons.visibilityOff : icons.visibility}</button>
           <button type="button" class="icon-btn copy-field" data-copy="secret">${icons.copy}</button>`
        : "",
    }),
  );
  if (pass) {
    rows.push(
      fieldRow({
        title: "Passphrase",
        value: opts.showPassphrase ? esc(pass) : maskDots(pass.length, 8, 20),
        icon: icons.password,
        iconClass: "primary",
        position: secret.notes ? "pos-center" : "pos-end",
        mono: true,
        dataCopy: "passphrase",
        trailingHtml: `<button type="button" class="icon-btn" data-action="toggle-passphrase">${opts.showPassphrase ? icons.visibilityOff : icons.visibility}</button>
           <button type="button" class="icon-btn copy-field" data-copy="passphrase">${icons.copy}</button>`,
      }),
    );
  }
  if (secret.notes) {
    rows.push(
      fieldRow({
        title: "Notes",
        value: esc(secret.notes),
        icon: icons.notes,
        iconClass: "highest",
        position: "pos-end",
        multiline: true,
        dataCopy: "notes",
      }),
    );
  }

  // Fix first/last positions when host/username absent.
  if (rows.length === 1) {
    rows[0] = rows[0]!.replace(/pos-\w+/g, "pos-alone");
  } else if (rows.length > 1) {
    rows[0] = rows[0]!.replace(/pos-\w+/g, "pos-start");
    rows[rows.length - 1] = rows[rows.length - 1]!.replace(
      /pos-\w+/g,
      "pos-end",
    );
  }

  const fillLabel =
    secret.secretKind === "apiToken"
      ? "Fill token on page"
      : secret.secretKind === "envSnippet"
        ? "Paste on page"
        : "Fill on page";

  return `
    <div class="detail-page">
      <div class="detail-hero">
        <div class="detail-avatar primary cookie">${icons.terminal ?? icons.key}</div>
        <h3 class="detail-name">${esc(name)}</h3>
        <span class="me-chip">${esc(kindLabel)}${secret.host ? ` · ${esc(secret.host)}` : ""}</span>
        <div class="detail-actions" style="margin-top:12px">
          <button type="button" class="btn-filled" data-action="copy-secret" ${value ? "" : "disabled"}>Copy secret</button>
          <button type="button" class="btn-tonal" data-action="copy-username" ${secret.username ? "" : "disabled"}>Copy user</button>
        </div>
        <button type="button" class="btn-tonal full" data-action="fill-secret" style="margin-top:8px" ${value ? "" : "disabled"}>${fillLabel}</button>
      </div>

      <div class="section-label">Secret details</div>
      <div class="settings-group">${rows.join("")}</div>
      <div class="section-label">Manage</div>
      <div class="detail-actions" style="padding:0 4px 8px">
        <button type="button" class="btn-tonal danger" data-action="delete">Delete</button>
      </div>
      <p class="meta-line">${esc(maskSecret(value))} · Revision ${secret.revision}</p>
    </div>`;
}

export { totpProgress, generateTotp, spacedNumber };
