/**
 * Decrypt local vault items and match by origin.
 */
import { decryptString } from "../../crypto/crypto";
import { listEntries } from "../../db/store";
import { matchAndRankByUrls } from "../../shared/url_match";
import {
  resolveCaptureDecision,
  type CaptureDecision,
} from "../../shared/capture_decision";
import { nativeRequest } from "../../native/bridge";
import type {
  DecryptedCard,
  DecryptedCrypto,
  DecryptedEntry,
  DecryptedSecret,
  VaultItem,
} from "../../shared/types";
import { ReservedCollections, fillUsername } from "../../shared/types";
import {
  asLoginFromNative,
  matchSecretsForOrigin,
  normalizeSecret,
  parseVaultItem,
} from "./mapping";
import { isUnlocked } from "./auth";
import { getSession, vaultKeyFromSession } from "./state";

export { matchSecretsForOrigin };
export type { CaptureDecision };

export async function decryptLocalItems(): Promise<VaultItem[]> {
  const session = await getSession();
  if (session.mode === "native") {
    const [logins, cards, cryptoWallets, secrets] = await Promise.all([
      nativeRequest({ type: "listEntries" }, 5000),
      nativeRequest({ type: "listCards" }, 5000),
      nativeRequest({ type: "listCrypto" }, 5000),
      nativeRequest({ type: "listSecrets" }, 5000),
    ]);
    const out: VaultItem[] = [];
    if (logins.ok && "entries" in logins) {
      for (const e of logins.entries) out.push(asLoginFromNative(e));
    }
    if (cards.ok && "cards" in cards) {
      for (const c of (cards as { cards: DecryptedCard[] }).cards) {
        out.push({ ...c, kind: "card", type: "card" });
      }
    }
    if (cryptoWallets.ok && "wallets" in cryptoWallets) {
      for (const w of (cryptoWallets as { wallets: DecryptedCrypto[] }).wallets) {
        out.push({ ...w, kind: "crypto", type: "crypto" });
      }
    }
    if (secrets.ok && "secrets" in secrets) {
      for (const s of (secrets as { secrets: Array<Record<string, unknown>> })
        .secrets) {
        out.push(
          normalizeSecret(
            {
              uuid: String(s.uuid ?? ""),
              collectionUuid:
                (s.collectionUuid as string | null | undefined) ??
                ReservedCollections.secrets,
              revision: Number(s.revision ?? 1),
            },
            {
              type: "secret",
              name: String(s.name ?? ""),
              kind: String(s.secretKind ?? s.kind ?? "other"),
              secretKind: String(s.secretKind ?? s.kind ?? ""),
              username: String(s.username ?? ""),
              host: String(s.host ?? ""),
              publicKey: String(s.publicKey ?? ""),
              secret: String(s.secret ?? ""),
              passphrase: String(s.passphrase ?? ""),
              notes: String(s.notes ?? ""),
              device: String(s.device ?? ""),
            },
          ),
        );
      }
    }
    return out;
  }

  const key = await vaultKeyFromSession();
  const rows = await listEntries();
  const out: VaultItem[] = [];
  for (const row of rows) {
    try {
      const json = decryptString(key, row.encryptedPayload);
      const payload = JSON.parse(json) as Record<string, unknown>;
      const item = parseVaultItem(row, payload);
      if (item) out.push(item);
    } catch {
      /* skip undecryptable */
    }
  }
  return out;
}

/** Login entries only — used by autofill and passkeys. */
export async function decryptLocalEntries(): Promise<DecryptedEntry[]> {
  const items = await decryptLocalItems();
  return items.filter((i): i is DecryptedEntry => i.kind === "login");
}

export async function decryptLocalCards(): Promise<DecryptedCard[]> {
  const items = await decryptLocalItems();
  return items.filter((i): i is DecryptedCard => i.kind === "card");
}

export async function decryptLocalCrypto(): Promise<DecryptedCrypto[]> {
  const items = await decryptLocalItems();
  return items.filter((i): i is DecryptedCrypto => i.kind === "crypto");
}

export async function decryptLocalSecrets(): Promise<DecryptedSecret[]> {
  const items = await decryptLocalItems();
  return items.filter((i): i is DecryptedSecret => i.kind === "secret");
}

export async function secretsForOrigin(
  origin: string,
): Promise<DecryptedSecret[]> {
  if (!(await isUnlocked())) return [];
  const all = await decryptLocalSecrets();
  return matchSecretsForOrigin(all, origin);
}

export function matchEntriesForOrigin(
  entries: DecryptedEntry[],
  origin: string,
): DecryptedEntry[] {
  return matchAndRankByUrls(entries, origin);
}

export async function entriesForOrigin(
  origin: string,
): Promise<DecryptedEntry[]> {
  const session = await getSession();
  if (session.mode === "native") {
    const res = await nativeRequest({ type: "listForOrigin", origin });
    if (res.ok && "entries" in res) {
      return res.entries.map((e) => asLoginFromNative(e));
    }
  }
  if (!(await isUnlocked())) return [];
  const all = await decryptLocalEntries();
  return matchEntriesForOrigin(all, origin);
}


export async function decideCapture(input: {
  username: string;
  password: string;
  url: string;
}): Promise<CaptureDecision> {
  const unlocked = await isUnlocked();
  const matches = unlocked
    ? (await entriesForOrigin(input.url)).map((e) => ({
        uuid: e.uuid,
        title: e.title,
        username: fillUsername(e),
        password: e.password,
      }))
    : [];
  return resolveCaptureDecision(input, { unlocked, matches });
}

