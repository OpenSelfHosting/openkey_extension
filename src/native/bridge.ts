import type { DecryptedEntry, PasskeyPayload } from "../shared/types";

const HOST_NAME = "com.openselfhosting.openkey";

export type NativeLoginPayload = {
  title: string;
  username: string;
  password: string;
  urls: string[];
  passkey?: PasskeyPayload | null;
  notes?: string;
  icon?: string;
};

export type NativeCardPayload = {
  name?: string;
  holder?: string;
  number?: string;
  expiry?: string;
  cvc?: string;
  brand?: string;
  notes?: string;
  bank?: string;
};

export type NativeCryptoPayload = {
  name?: string;
  network?: string;
  address?: string;
  privateKey?: string;
  seedPhrase?: string;
  notes?: string;
  folder?: string;
};

export type NativeRequest =
  | { type: "ping" }
  | { type: "listForOrigin"; origin: string }
  | { type: "listEntries"; origin?: string }
  | { type: "listCards" }
  | { type: "listCrypto" }
  | { type: "listSecrets" }
  | { type: "listCollections" }
  | { type: "listVault" }
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
  | {
      type: "updateSecret";
      uuid: string;
      secret: {
        name?: string;
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
  | { type: "deleteSecret"; uuid: string }
  | { type: "createCard"; card: NativeCardPayload }
  | { type: "updateCard"; uuid: string; card: NativeCardPayload }
  | { type: "deleteCard"; uuid: string }
  | { type: "createCrypto"; wallet: NativeCryptoPayload }
  | { type: "updateCrypto"; uuid: string; wallet: NativeCryptoPayload }
  | { type: "deleteCrypto"; uuid: string };

export type NativeResponse =
  | { ok: true; unlocked: boolean }
  | {
      ok: true;
      entries: DecryptedEntry[];
      collections: import("../shared/types").DecryptedCollection[];
      cards?: import("../shared/types").DecryptedCard[];
      wallets?: import("../shared/types").DecryptedCrypto[];
      secrets?: import("../shared/types").DecryptedSecret[];
    }
  | { ok: true; entries: DecryptedEntry[] }
  | { ok: true; cards: import("../shared/types").DecryptedCard[] }
  | { ok: true; wallets: import("../shared/types").DecryptedCrypto[] }
  | { ok: true; secrets: import("../shared/types").DecryptedSecret[] }
  | { ok: true; collections: import("../shared/types").DecryptedCollection[] }
  | { ok: true; secret: import("../shared/types").DecryptedSecret }
  | { ok: true; card: import("../shared/types").DecryptedCard }
  | { ok: true; wallet: import("../shared/types").DecryptedCrypto }
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
  if (msg.type === "ping") {
    return nativeRequestUnqueued(msg, timeoutMs);
  }
  return enqueueNative(() => nativeRequestUnqueued(msg, timeoutMs));
}

let nativeQueue: Promise<void> = Promise.resolve();

function enqueueNative<T>(fn: () => Promise<T>): Promise<T> {
  const run = nativeQueue.then(fn, fn);
  nativeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function nativeRequestUnqueued(
  msg: NativeRequest,
  timeoutMs: number,
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
