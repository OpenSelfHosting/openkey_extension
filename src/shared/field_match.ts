/** Pure heuristics for classifying login-related form fields. */

export function fieldHintText(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function isLikelyUsernameField(input: {
  type?: string;
  autocomplete?: string;
  hint?: string;
}): boolean {
  const type = (input.type || "text").toLowerCase();
  if (type === "email") return true;
  if (type !== "text" && type !== "search" && type !== "") return false;
  const auto = (input.autocomplete || "").toLowerCase();
  if (
    auto === "username" ||
    auto === "email" ||
    auto.includes("username") ||
    auto.includes("email")
  ) {
    return true;
  }
  const hint = (input.hint || "").toLowerCase();
  return /user|email|login|account|phone|mobile/.test(hint);
}

export function isLikelyTokenField(hint: string): boolean {
  return /api[_\s.-]?key|api[_\s.-]?token|access[_\s.-]?token|secret[_\s.-]?key|bearer|x-api-key|auth[_\s.-]?token|\btoken\b|personal[_\s.-]?access|\bpat\b|client[_\s.-]?secret/i.test(
    hint,
  );
}

/**
 * Prefer an explicit preferred index, then active/focused, else first.
 * Returns -1 when there are no candidates.
 */
export function selectPreferredIndex(
  length: number,
  preferredIndex: number | null | undefined,
  activeIndex: number | null | undefined = null,
): number {
  if (length <= 0) return -1;
  if (
    preferredIndex != null &&
    preferredIndex >= 0 &&
    preferredIndex < length
  ) {
    return preferredIndex;
  }
  if (activeIndex != null && activeIndex >= 0 && activeIndex < length) {
    return activeIndex;
  }
  return 0;
}

/**
 * Sites can opt out of password-manager UI with common data attributes
 * (OpenKey, Bitwarden, 1Password, LastPass).
 */
export function isAutofillIgnored(el: Element): boolean {
  return !!el.closest(
    "[data-openkey-ignore],[data-bwignore],[data-1p-ignore],[data-lpignore]",
  );
}
