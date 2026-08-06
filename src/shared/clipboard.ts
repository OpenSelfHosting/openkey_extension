/**
 * Clipboard helpers with optional auto-clear (password-manager hygiene).
 */

let clearTimer: ReturnType<typeof setTimeout> | null = null;
let pendingClear: string | null = null;

export type CopyTextOptions = {
  /** Clear clipboard after this many ms if still holding our text. 0 = never. */
  clearAfterMs?: number;
};

async function clearIfStillOurs(expected: string): Promise<void> {
  try {
    if (!navigator.clipboard?.readText) {
      return;
    }
    const current = await navigator.clipboard.readText();
    if (current === expected) {
      await navigator.clipboard.writeText("");
    }
  } catch {
    /* read may be denied — leave clipboard alone */
  }
}

/** Write text to the clipboard; optionally clear later if unchanged. */
export async function copyText(
  text: string,
  opts?: CopyTextOptions,
): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard unavailable");
  }
  await navigator.clipboard.writeText(text);

  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  pendingClear = null;

  const ms = opts?.clearAfterMs ?? 0;
  if (ms <= 0 || !text) return;

  pendingClear = text;
  clearTimer = setTimeout(() => {
    const expected = pendingClear;
    pendingClear = null;
    clearTimer = null;
    if (expected != null) void clearIfStillOurs(expected);
  }, ms);
}

/** Cancel a pending auto-clear (e.g. on lock). */
export function cancelClipboardClear(): void {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = null;
  pendingClear = null;
}
