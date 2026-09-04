/**
 * Empty-state copy for vault list tabs.
 * Kept pure for unit tests and reuse.
 */
export function vaultEmptyMessage(input: {
  tab: "vault" | "cards" | "crypto" | "secrets";
  searching: boolean;
  filtered: boolean;
  native: boolean;
}): string {
  if (input.searching || input.filtered) {
    return input.filtered && !input.searching
      ? "Try a different search or filter."
      : "Try a different search.";
  }
  if (input.native) {
    switch (input.tab) {
      case "vault":
        return "Add logins in the OpenKey desktop app, or tap + to save one here.";
      case "cards":
        return "Tap + to add a card (saved in the unlocked desktop app).";
      case "crypto":
        return "Tap + to add a wallet (saved in the unlocked desktop app).";
      case "secrets":
        return "Tap + to add a secret (saved in the unlocked desktop app).";
    }
  }
  switch (input.tab) {
    case "vault":
      return "Tap + to add a login, or sync from the app.";
    case "cards":
      return "Tap + to add a card, or sync from the app.";
    case "crypto":
      return "Tap + to add a wallet, or sync from the app.";
    case "secrets":
      return "Tap + to add an API token, SSH key, or .env snippet.";
  }
}
