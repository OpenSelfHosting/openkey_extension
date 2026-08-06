import type { DecryptedCollection, DecryptedEntry, TotpConfig } from "./types";

export type ImportItem = {
  title: string;
  username: string;
  password: string;
  urls: string[];
  notes: string;
  folder?: string;
  totp?: TotpConfig | null;
};

export type ExportFormat = "bitwardenJson" | "chromeCsv" | "onePasswordCsv";

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    const next = raw[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function toCsv(rows: Array<Array<string | number>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    )
    .join("\n");
}

function parseTotp(raw: string | undefined | null): TotpConfig | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (value.startsWith("otpauth://")) {
    try {
      const url = new URL(value);
      const secret = url.searchParams.get("secret");
      if (!secret) return null;
      const period = Number(url.searchParams.get("period") ?? 30);
      const digits = Number(url.searchParams.get("digits") ?? 6);
      const algorithm = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase();
      return {
        secret: secret.replace(/\s+/g, ""),
        period: Number.isFinite(period) ? period : 30,
        digits: Number.isFinite(digits) ? digits : 6,
        algorithm:
          algorithm === "SHA256" || algorithm === "SHA512"
            ? algorithm
            : "SHA1",
      };
    } catch {
      return { secret: value.replace(/\s+/g, "") };
    }
  }
  return { secret: value.replace(/\s+/g, "") };
}

export function parseBitwardenJson(raw: string): ImportItem[] {
  const data = JSON.parse(raw) as {
    folders?: Array<{ id?: string; name?: string }>;
    items?: Array<Record<string, unknown>>;
  };
  const folders = new Map<string, string>();
  for (const f of data.folders ?? []) {
    folders.set(String(f.id ?? ""), String(f.name ?? ""));
  }
  const items: ImportItem[] = [];
  for (const item of data.items ?? []) {
    if (Number(item.type) !== 1) continue;
    const login = (item.login as Record<string, unknown>) ?? {};
    const uris = ((login.uris as Array<{ uri?: string }>) ?? [])
      .map((u) => String(u.uri ?? "").trim())
      .filter(Boolean);
    items.push({
      title: String(item.name ?? "Untitled"),
      username: String(login.username ?? ""),
      password: String(login.password ?? ""),
      urls: uris,
      notes: String(item.notes ?? ""),
      folder: folders.get(String(item.folderId ?? "")) || undefined,
      totp: parseTotp(login.totp as string | undefined),
    });
  }
  return items;
}

export function parseChromeCsv(raw: string): ImportItem[] {
  const rows = parseCsv(raw);
  if (!rows.length) return [];
  const header = rows[0]!.map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const nameIdx = idx("name");
  const urlIdx = idx("url");
  const userIdx = idx("username");
  const passIdx = idx("password");
  const noteIdx = idx("note");
  const items: ImportItem[] = [];
  for (const row of rows.slice(1)) {
    const cell = (i: number) => (i >= 0 && i < row.length ? row[i]! : "");
    const url = cell(urlIdx);
    items.push({
      title: cell(nameIdx) || url || "Untitled",
      username: cell(userIdx),
      password: cell(passIdx),
      urls: url ? [url] : [],
      notes: cell(noteIdx),
    });
  }
  return items;
}

export function parseOnePasswordCsv(raw: string): ImportItem[] {
  const rows = parseCsv(raw);
  if (!rows.length) return [];
  const header = rows[0]!.map((h) => h.toLowerCase());
  const find = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const titleIdx = find("title", "name");
  const userIdx = find("username", "user");
  const passIdx = find("password");
  const urlIdx = find("url", "website");
  const notesIdx = find("notes", "notesplain");
  const otpIdx = find("otpauth", "totp");
  const items: ImportItem[] = [];
  for (const row of rows.slice(1)) {
    const cell = (i: number) => (i >= 0 && i < row.length ? row[i]! : "");
    items.push({
      title: cell(titleIdx) || "Untitled",
      username: cell(userIdx),
      password: cell(passIdx),
      urls: cell(urlIdx) ? [cell(urlIdx)] : [],
      notes: cell(notesIdx),
      totp: parseTotp(cell(otpIdx)),
    });
  }
  return items;
}

/** LastPass CSV: url,username,password,totp,extra,name,grouping,fav */
export function parseLastPassCsv(raw: string): ImportItem[] {
  const rows = parseCsv(raw);
  if (!rows.length) return [];
  const header = rows[0]!.map((h) => h.toLowerCase());
  const find = (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const urlIdx = find("url", "website");
  const userIdx = find("username", "user");
  const passIdx = find("password");
  const totpIdx = find("totp", "otpauth");
  const notesIdx = find("extra", "notes", "notesplain");
  const nameIdx = find("name", "title");
  const folderIdx = find("grouping", "folder");
  const items: ImportItem[] = [];
  for (const row of rows.slice(1)) {
    const cell = (i: number) => (i >= 0 && i < row.length ? row[i]! : "");
    const url = cell(urlIdx);
    const username = cell(userIdx);
    const password = cell(passIdx);
    const notes = cell(notesIdx);
    const name = cell(nameIdx);
    const folder = cell(folderIdx).trim();
    const otp = cell(totpIdx);
    if (!url && !username && !password && !notes && !name && !otp) continue;
    items.push({
      title: name || url || "Untitled",
      username,
      password,
      urls: url ? [url] : [],
      notes,
      folder: folder || undefined,
      totp: parseTotp(otp),
    });
  }
  return items;
}

export function detectAndParseImport(raw: string, hint?: string): ImportItem[] {
  const trimmed = raw.trim();
  if (hint === "bitwardenJson" || trimmed.startsWith("{")) {
    return parseBitwardenJson(trimmed);
  }
  if (hint === "onePasswordCsv") return parseOnePasswordCsv(trimmed);
  if (hint === "lastPassCsv") return parseLastPassCsv(trimmed);
  if (hint === "chromeCsv") return parseChromeCsv(trimmed);
  const header = trimmed.split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  if (header.includes("grouping")) {
    return parseLastPassCsv(trimmed);
  }
  // Heuristic: 1Password has otpauth column often.
  if (header.includes("otpauth") || header.includes("notesplain")) {
    return parseOnePasswordCsv(trimmed);
  }
  return parseChromeCsv(trimmed);
}

function otpAuthUri(entry: DecryptedEntry): string {
  const totp = entry.totp;
  if (!totp?.secret) return "";
  const label = encodeURIComponent(
    entry.username.trim() || entry.title.trim() || "login",
  );
  const params = new URLSearchParams({
    secret: totp.secret.replace(/\s+/g, ""),
    issuer: "OpenKey",
  });
  if (totp.period && totp.period !== 30) params.set("period", String(totp.period));
  if (totp.digits && totp.digits !== 6) params.set("digits", String(totp.digits));
  if (totp.algorithm && totp.algorithm !== "SHA1") {
    params.set("algorithm", totp.algorithm);
  }
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function buildExport(
  format: ExportFormat,
  entries: DecryptedEntry[],
  collections: DecryptedCollection[],
): { content: string; filename: string; mime: string } {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "bitwardenJson") {
    const folderIdByUuid = new Map<string, string>();
    const folders = collections.map((c) => {
      const id = crypto.randomUUID();
      folderIdByUuid.set(c.uuid, id);
      return { id, name: c.name };
    });
    const items = entries.map((e) => ({
      id: e.uuid,
      name: e.title,
      notes: e.notes,
      type: 1,
      ...(e.collectionUuid && folderIdByUuid.has(e.collectionUuid)
        ? { folderId: folderIdByUuid.get(e.collectionUuid) }
        : {}),
      login: {
        username: e.username,
        password: e.password,
        ...(e.urls.length
          ? { uris: e.urls.map((uri) => ({ uri })) }
          : {}),
        ...(e.totp?.secret ? { totp: otpAuthUri(e) } : {}),
      },
    }));
    return {
      content: JSON.stringify({ encrypted: false, folders, items }, null, 2),
      filename: `openkey-export-${stamp}.json`,
      mime: "application/json",
    };
  }

  if (format === "onePasswordCsv") {
    const rows: Array<Array<string>> = [
      ["title", "username", "password", "url", "notes", "otpauth"],
      ...entries.map((e) => [
        e.title,
        e.username,
        e.password,
        e.urls[0] ?? "",
        e.notes,
        otpAuthUri(e),
      ]),
    ];
    return {
      content: toCsv(rows),
      filename: `openkey-1password-${stamp}.csv`,
      mime: "text/csv",
    };
  }

  const rows: Array<Array<string>> = [
    ["name", "url", "username", "password", "note"],
    ...entries.map((e) => [
      e.title,
      e.urls[0] ?? "",
      e.username,
      e.password,
      e.notes,
    ]),
  ];
  return {
    content: toCsv(rows),
    filename: `openkey-chrome-${stamp}.csv`,
    mime: "text/csv",
  };
}
