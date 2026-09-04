/**
 * Session storage helpers shared by auth / vault / sync modules.
 */
import { fromB64Url } from "../../crypto/crypto";
import { getSettings } from "../../db/store";
import {
  SESSION_STORAGE_KEY,
  sessionLooksUnlocked,
  type SessionState,
} from "../../shared/types";

export async function getSession(): Promise<SessionState> {
  const data = await chrome.storage.session.get(SESSION_STORAGE_KEY);
  return (data[SESSION_STORAGE_KEY] as SessionState) ?? { unlocked: false };
}

async function updateActionBadge(session: SessionState): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.action?.setBadgeText) return;
  const unlocked = sessionLooksUnlocked(session);
  try {
    if (!unlocked) {
      await chrome.action.setBadgeBackgroundColor({ color: "#B3261E" });
      await chrome.action.setBadgeText({ text: "!" });
      await chrome.action.setTitle({ title: "OpenKey — locked" });
      return;
    }
    await chrome.action.setBadgeBackgroundColor({ color: "#1B6B4A" });
    if (session.mode === "native") {
      await chrome.action.setBadgeText({ text: "App" });
      await chrome.action.setTitle({
        title: "OpenKey — connected to desktop app",
      });
    } else {
      await chrome.action.setBadgeText({ text: "ON" });
      await chrome.action.setTitle({ title: "OpenKey — unlocked" });
    }
    if (chrome.action.setBadgeTextColor) {
      await chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
    }
  } catch {
    /* action API unavailable in some contexts */
  }
}

/** Tell open tabs so autofill overlays appear/disappear without a reload. */
async function broadcastSession(session: SessionState): Promise<void> {
  void updateActionBadge(session);
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return;
  const payload = {
    type: "OPENKEY_SESSION",
    unlocked: sessionLooksUnlocked(session),
    mode: session.mode ?? null,
  };
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null) return;
      await sendSessionToTab(tab.id, payload);
    }),
  );
}

async function sendSessionToTab(
  tabId: number,
  payload: { type: string; unlocked: boolean; mode: string | null },
): Promise<void> {
  for (const delayMs of [0, 200, 500]) {
    if (delayMs) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    try {
      await chrome.tabs.sendMessage(tabId, payload);
      return;
    } catch {
      /* content script not ready yet — retry */
    }
  }
}

export async function setSession(session: SessionState): Promise<void> {
  await exposeSessionToPages();
  await chrome.storage.session.set({ [SESSION_STORAGE_KEY]: session });
  void broadcastSession(session);
}

/** Let content scripts read session storage so unlock is visible without a reload. */
export async function exposeSessionToPages(): Promise<void> {
  try {
    await chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });
  } catch {
    /* Chrome < 123 or Firefox */
  }
}

/** Refresh toolbar badge from the current session (SW restart / install). */
export async function syncActionBadge(): Promise<void> {
  await updateActionBadge(await getSession());
}

export async function vaultKeyFromSession(): Promise<Uint8Array> {
  const s = await getSession();
  if (!s.unlocked || !s.vaultKeyB64) throw new Error("Vault locked");
  return fromB64Url(s.vaultKeyB64);
}

export function scheduleAutoLock(): void {
  void (async () => {
    const settings = await getSettings();
    await chrome.alarms.clear("auto-lock");
    await chrome.alarms.create("auto-lock", {
      delayInMinutes: Math.max(1, settings.lockMinutes),
    });
  })();
}
