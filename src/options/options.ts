const msg = document.getElementById("msg")!;
const extensionIdEl = document.getElementById("extensionId")!;
const unlockPill = document.getElementById("unlockPill")!;
const modePill = document.getElementById("modePill")!;

function setMsg(text: string, ok: boolean): void {
  msg.className = ok ? "ok" : "err";
  msg.textContent = text;
}

async function refreshStatus(): Promise<void> {
  try {
    const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
    const unlocked = !!status?.unlocked;
    unlockPill.textContent = unlocked ? "Vault unlocked" : "Vault locked";
    unlockPill.className = unlocked ? "pill on" : "pill off";
    const mode = status?.mode;
    if (unlocked && mode === "native") {
      modePill.textContent = "Desktop bridge";
      modePill.className = "pill on";
    } else if (unlocked) {
      modePill.textContent = "Standalone vault";
      modePill.className = "pill on";
    } else {
      modePill.textContent = "Mode —";
      modePill.className = "pill off";
    }
  } catch {
    unlockPill.textContent = "Status unavailable";
    unlockPill.className = "pill off";
    modePill.textContent = "Mode —";
    modePill.className = "pill off";
  }
}

async function load() {
  const res = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  const s = res.settings;
  (document.getElementById("serverUrl") as HTMLInputElement).value = s.serverUrl;
  (document.getElementById("lockMinutes") as HTMLInputElement).value = String(
    s.lockMinutes,
  );
  (document.getElementById("preferNative") as HTMLInputElement).checked =
    !!s.preferNativeBridge;
  extensionIdEl.textContent = chrome.runtime.id;
  await refreshStatus();
}

document.getElementById("save")!.addEventListener("click", async () => {
  const settings = {
    serverUrl: (document.getElementById("serverUrl") as HTMLInputElement).value
      .trim()
      .replace(/\/$/, ""),
    lockMinutes: Number(
      (document.getElementById("lockMinutes") as HTMLInputElement).value,
    ),
    preferNativeBridge: (
      document.getElementById("preferNative") as HTMLInputElement
    ).checked,
  };
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings });
  setMsg("Settings saved", true);
  await refreshStatus();
});

document.getElementById("link")!.addEventListener("click", async () => {
  const meta = {
    email: (document.getElementById("email") as HTMLInputElement).value,
    saltB64: (document.getElementById("salt") as HTMLInputElement).value,
    wrappedVaultKey: (document.getElementById("wrapped") as HTMLTextAreaElement)
      .value,
  };
  const res = await chrome.runtime.sendMessage({ type: "LINK_VAULT", meta });
  if (!res.ok) {
    setMsg(res.error ?? "Failed", false);
    return;
  }
  setMsg("Vault metadata linked", true);
});

document.getElementById("copyId")!.addEventListener("click", async () => {
  await navigator.clipboard.writeText(chrome.runtime.id);
  setMsg("Extension ID copied", true);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refreshStatus();
});

void load();
