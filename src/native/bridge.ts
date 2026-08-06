import type { DecryptedEntry, PasskeyPayload } from "../shared/types";

const HOST_NAME = "com.openselfhosting.openkey";

export type NativeLoginPayload = {
  title: string;
  username: string;
  password: string;
  urls: string[];
  passkey?: PasskeyPayload | null;
  notes?: string;
};

export type NativeRequest =
  | { type: "ping" }
  | { type: "listForOrigin"; origin: string }
  | { type: "listEntries" }
  | { type: "listCards" }
  | { type: "listCrypto" }
  | { type: "listSecrets" }
  | { type: "getEntry"; uuid: string }
  | { type: "createEntry"; entry: NativeLoginPayload }
  | { type: "updateEntry"; uuid: string; entry: NativeLoginPayload }
  | { type: "deleteEntry"; uuid: string }
  | {
      type: "updatePasskeySignCount";
      uuid: string;
      signCount: number;
    }
      | {
          type: "createSecret";
          secret: {
            name: string;
            kind?: string;
            username?: string;
            host?: string;
            publicKey?: string;
            secret?: string;
            passphrase?: string;
            notes?: string;
            device?: string;
          };
        }
  | { type: "deleteSecret"; uuid: string };

export type NativeResponse =
  | { ok: true; unlocked: boolean }
  | { ok: true; entries: DecryptedEntry[] }
  | { ok: true; cards: import("../shared/types").DecryptedCard[] }
  | { ok: true; wallets: import("../shared/types").DecryptedCrypto[] }
  | { ok: true; secrets: import("../shared/types").DecryptedSecret[] }
  | { ok: true; secret: import("../shared/types").DecryptedSecret }
  | { ok: true; entry: DecryptedEntry | null }
  | { ok: true }
  | { ok: false; error: string };

export function isNativeMessagingAvailable(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.connectNative;
}

export async function nativeRequest(
  msg: NativeRequest,
  timeoutMs = 2500,
): Promise<NativeResponse> {
  if (!isNativeMessagingAvailable()) {
    return { ok: false, error: "Native messaging unavailable" };
  }

  return new Promise((resolve) => {
    let settled = false;
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connectNative(HOST_NAME);
    } catch (e) {
      resolve({ ok: false, error: String(e) });
      return;
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          port.disconnect();
        } catch {
          /* ignore */
        }
        resolve({ ok: false, error: "Native host timeout" });
      }
    }, timeoutMs);

    port.onMessage.addListener((response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response as NativeResponse);
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const err = chrome.runtime.lastError?.message ?? "Native host disconnected";
      resolve({ ok: false, error: err });
    });

    port.postMessage(msg);
  });
}

export async function tryNativePing(): Promise<boolean> {
  const res = await nativeRequest({ type: "ping" });
  return res.ok === true && "unlocked" in res && res.unlocked === true;
}
