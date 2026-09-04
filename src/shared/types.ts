export type TotpConfig = {
  secret: string;
  period?: number;
  digits?: number;
  algorithm?: "SHA1" | "SHA256" | "SHA512";
};

export type AttachmentMeta = {
  id: string;
  name: string;
  size: number;
  cipher?: string;
};

export type PasskeyPayload = {
  rpId: string;
  userHandle?: string;
  credentialId: string;
  /** PKCS8 private key (base64url), protected by outer vault encryption. */
  privateKeyCipher?: string;
  /** COSE_Key public key (base64url CBOR). */
  publicKey?: string;
  /** COSE algorithm identifier; default -7 (ES256). */
  alg?: number;
  /** Signature counter. */
  signCount?: number;
  userName?: string;
  displayName?: string;
};

/** Extra typed field on a login entry (email, phone, PIN, …) — matches app EntryExtraField. */
export type EntryExtraField = {
  type: string;
  value: string;
};

/**
 * Decrypted login payload — mirrors openkey_app VaultEntry.toPayload().
 * Ciphertext on the server is opaque; these fields live inside encrypted_payload.
 */
export type EntryPayload = {
  type?: "login" | string;
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
  tags?: string[];
  fields?: EntryExtraField[];
  fieldOrder?: string[];
  icon?: string;
  totp?: TotpConfig | null;
  attachments?: AttachmentMeta[];
  passkey?: PasskeyPayload | null;
};

/** Payment card — mirrors openkey_app WalletCard.toPayload(). */
export type CardPayload = {
  type: "card";
  name: string;
  holder: string;
  number: string;
  expiry: string;
  cvc: string;
  brand?: string;
  notes?: string;
  /** Bank / issuer folder label for grouping cards. */
  bank?: string;
};

/** Crypto wallet — mirrors openkey_app CryptoWallet.toPayload(). */
export type CryptoPayload = {
  type: "crypto";
  name: string;
  network: string;
  address: string;
  privateKey?: string;
  seedPhrase?: string;
  notes?: string;
  /** Logical folder used to group wallets (e.g. "Cold storage"). */
  folder?: string;
};

/** Developer secret kinds — mirrors openkey_app SecretKind. */
export type SecretKindName = "sshKey" | "apiToken" | "envSnippet" | "other";

/** Developer secret — mirrors openkey_app DevSecret.toPayload(). */
export type SecretPayload = {
  type: "secret";
  name: string;
  /** SSH / API / env / other — stored as `kind` in encrypted payload. */
  kind: SecretKindName | string;
  username?: string;
  host?: string;
  publicKey?: string;
  /** Private key, API token, or .env body. */
  secret?: string;
  passphrase?: string;
  notes?: string;
  /** Device / machine label for grouping inside Secrets. */
  device?: string;
};

export type StoredEntry = {
  uuid: string;
  collectionUuid: string | null;
  encryptedPayload: string;
  revision: number;
  isDeleted: boolean;
  updatedAt: string;
  /**
   * False / missing = needs push (dirty). True after a successful sync push
   * or when applied from a server pull. Missing is treated as dirty for migration.
   */
  isSynced?: boolean;
};

export type StoredCollection = {
  uuid: string;
  encryptedName: string;
  icon: string;
  color: number | null;
  /** Nested folder parent; null = top-level. */
  parentUuid: string | null;
  sortOrder: number;
  revision: number;
  isDeleted: boolean;
  updatedAt: string;
  /** See StoredEntry.isSynced. */
  isSynced?: boolean;
};

/** Attachment ciphertext row (from /sync or GET /attachments/{id}/content). */
export type StoredAttachment = {
  uuid: string;
  entryUuid: string;
  filename: string;
  sizeBytes: number;
  contentType: string | null;
  revision: number;
  isDeleted: boolean;
  encryptedBlob: string;
  updatedAt: string;
};

export type DecryptedEntry = EntryPayload & {
  kind: "login";
  uuid: string;
  collectionUuid: string | null;
  revision: number;
};

export type DecryptedCard = CardPayload & {
  kind: "card";
  uuid: string;
  collectionUuid: string | null;
  revision: number;
};

export type DecryptedCrypto = CryptoPayload & {
  kind: "crypto";
  uuid: string;
  collectionUuid: string | null;
  revision: number;
};

export type DecryptedSecret = {
  kind: "secret";
  type: "secret";
  uuid: string;
  collectionUuid: string | null;
  revision: number;
  name: string;
  /** Discriminator for SSH / API token / env / other. */
  secretKind: SecretKindName;
  username: string;
  host: string;
  publicKey: string;
  secret: string;
  passphrase: string;
  notes: string;
  device: string;
};

export type VaultItem =
  | DecryptedEntry
  | DecryptedCard
  | DecryptedCrypto
  | DecryptedSecret;

export type SessionState = {
  unlocked: boolean;
  email?: string;
  authHash?: string;
  /** base64url vault key — kept in memory via chrome.storage.session when possible */
  vaultKeyB64?: string;
  wrappedVaultKey?: string;
  saltB64?: string;
  kdfParams?: Record<string, unknown>;
  mode?: "standalone" | "native";
};

export const SESSION_STORAGE_KEY = "openkey_session";

/** True when the vault can serve fills (native desktop or standalone with a key). */
export function sessionLooksUnlocked(
  session: SessionState | null | undefined,
): boolean {
  if (!session?.unlocked) return false;
  if (session.mode === "native") return true;
  return !!session.vaultKeyB64;
}

export type ThemeMode = "system" | "light" | "dark";

export type LocaleCode =
  | "en"
  | "zh"
  | "hi"
  | "es"
  | "fr"
  | "ar"
  | "bn"
  | "pt"
  | "ru"
  | "ur";

export const LOCALES: Array<{
  code: LocaleCode;
  englishName: string;
  nativeName: string;
  rtl?: boolean;
}> = [
  { code: "en", englishName: "English", nativeName: "English" },
  { code: "zh", englishName: "Chinese", nativeName: "中文" },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी" },
  { code: "es", englishName: "Spanish", nativeName: "Español" },
  { code: "fr", englishName: "French", nativeName: "Français" },
  { code: "ar", englishName: "Arabic", nativeName: "العربية", rtl: true },
  { code: "bn", englishName: "Bengali", nativeName: "বাংলা" },
  { code: "pt", englishName: "Portuguese", nativeName: "Português" },
  { code: "ru", englishName: "Russian", nativeName: "Русский" },
  { code: "ur", englishName: "Urdu", nativeName: "اردو", rtl: true },
];

export type PasswordGenOptions = {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
};

export const DEFAULT_PASSWORD_GEN: PasswordGenOptions = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: false,
};

export type Settings = {
  serverUrl: string;
  lockMinutes: number;
  /**
   * Seconds after a copy before the clipboard is cleared (if still our text).
   * 0 disables auto-clear.
   */
  clipboardClearSeconds: number;
  preferNativeBridge: boolean;
  themeMode: ThemeMode;
  locale: LocaleCode;
  highContrast: boolean;
  /** CSS font-family stack key. */
  font: string;
  sortMode: "name" | "recent";
  passwordGen: PasswordGenOptions;
  accessToken?: string;
  refreshToken?: string;
};

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: "http://localhost:8000",
  lockMinutes: 15,
  clipboardClearSeconds: 30,
  preferNativeBridge: true,
  themeMode: "system",
  locale: "en",
  highContrast: false,
  font: "system",
  sortMode: "name",
  passwordGen: { ...DEFAULT_PASSWORD_GEN },
};

export const FONT_OPTIONS: Array<{
  id: string;
  title: string;
  subtitle: string;
  css: string;
}> = [
  {
    id: "system",
    title: "System",
    subtitle: "Segoe UI / SF Pro / system",
    css: '"Segoe UI", "SF Pro Text", system-ui, sans-serif',
  },
  {
    id: "sans",
    title: "Sans",
    subtitle: "Helvetica / Arial",
    css: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    id: "georgia",
    title: "Georgia",
    subtitle: "Classic serif",
    css: 'Georgia, "Times New Roman", serif',
  },
  {
    id: "mono",
    title: "Monospace",
    subtitle: "Code-friendly",
    css: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  {
    id: "rounded",
    title: "Rounded",
    subtitle: "Friendly UI (system rounded)",
    css: '"SF Pro Rounded", "Segoe UI", system-ui, sans-serif',
  },
];


/** Decrypted folder — mirrors openkey_app VaultCollection for vault UI. */
export type DecryptedCollection = {
  uuid: string;
  name: string;
  icon: string;
  color: number | null;
  parentUuid: string | null;
  sortOrder: number;
};

/** Reserved collection namespaces — match openkey_app ReservedCollections. */
export const ReservedCollections = {
  wallets: "__wallets__",
  crypto: "__crypto_wallets__",
  secrets: "__dev_secrets__",
} as const;

export function isReservedCollection(id: string | null | undefined): boolean {
  return (
    id === ReservedCollections.wallets ||
    id === ReservedCollections.crypto ||
    id === ReservedCollections.secrets
  );
}

/** Prefer username, then email extra-field — used when filling login forms. */
export function fillUsername(entry: Pick<EntryPayload, "username" | "fields">): string {
  if (entry.username?.trim()) return entry.username;
  const email = entry.fields?.find((f) => f.type === "email")?.value?.trim();
  return email ?? "";
}

export function isLoginItem(item: VaultItem): item is DecryptedEntry {
  return item.kind === "login";
}

export function isCardItem(item: VaultItem): item is DecryptedCard {
  return item.kind === "card";
}

export function isCryptoItem(item: VaultItem): item is DecryptedCrypto {
  return item.kind === "crypto";
}

export function isSecretItem(item: VaultItem): item is DecryptedSecret {
  return item.kind === "secret";
}

export function normalizeSecretKind(name?: string | null): SecretKindName {
  const key = (name ?? "").toLowerCase().trim();
  if (
    key === "sshkey" ||
    key === "ssh_key" ||
    key === "ssh" ||
    name === "sshKey"
  )
    return "sshKey";
  if (
    key === "apitoken" ||
    key === "api_token" ||
    key === "api" ||
    key === "token" ||
    name === "apiToken"
  )
    return "apiToken";
  if (
    key === "envsnippet" ||
    key === "env_snippet" ||
    key === "env" ||
    key === "dotenv" ||
    key === ".env" ||
    name === "envSnippet"
  )
    return "envSnippet";
  return "other";
}

export function secretKindLabel(kind: SecretKindName): string {
  switch (kind) {
    case "sshKey":
      return "SSH key";
    case "apiToken":
      return "API token";
    case "envSnippet":
      return ".env";
    default:
      return "Secret";
  }
}

export function maskSecret(value: string): string {
  const v = value.trim();
  if (!v) return "—";
  if (v.length <= 8) return "••••••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

export function cardBrandLabel(brand?: string, number?: string): string {
  const fromName = brand?.toLowerCase().trim() ?? "";
  const named: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    maestro: "Mastercard",
    amex: "Amex",
    "american express": "Amex",
    americanexpress: "Amex",
    discover: "Discover",
    unionpay: "UnionPay",
    "union pay": "UnionPay",
    rupay: "RuPay",
    "ru pay": "RuPay",
    elo: "Elo",
    hipercard: "Hipercard",
    mir: "Mir",
  };
  if (fromName && named[fromName]) return named[fromName];

  const digits = (number ?? "").replace(/\D/g, "");
  if (/^220[0-4]/.test(digits)) return "Mir";
  if (digits.startsWith("606282")) return "Hipercard";
  if (digits.startsWith("6521") || digits.startsWith("6522")) return "RuPay";
  if (digits.startsWith("6011") || digits.startsWith("65")) return "Discover";
  if (digits.startsWith("62")) return "UnionPay";
  if (digits.startsWith("60")) return "RuPay";
  if (digits.startsWith("4")) return "Visa";
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]|7[01]|720)/.test(digits)) {
    return "Mastercard";
  }
  if (/^3[47]/.test(digits)) return "Amex";
  if (digits.startsWith("6011") || digits.startsWith("65")) return "Discover";
  return "Card";
}

export function maskCardNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `•••• ${digits.slice(-4)}`;
}

export function maskAddress(address: string): string {
  const value = address.trim();
  if (value.length <= 10) return value || "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
