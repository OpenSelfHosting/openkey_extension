import { describe, expect, it } from "vitest";
import { cardBrandLabel, sessionLooksUnlocked } from "./types";

describe("cardBrandLabel", () => {
  it("maps app brand names including newer networks", () => {
    expect(cardBrandLabel("unionpay")).toBe("UnionPay");
    expect(cardBrandLabel("rupay")).toBe("RuPay");
    expect(cardBrandLabel("elo")).toBe("Elo");
    expect(cardBrandLabel("hipercard")).toBe("Hipercard");
    expect(cardBrandLabel("mir")).toBe("Mir");
    expect(cardBrandLabel("visa")).toBe("Visa");
  });

  it("detects BIN prefixes when the name is missing", () => {
    expect(cardBrandLabel(undefined, "2200123412341234")).toBe("Mir");
    expect(cardBrandLabel(undefined, "6212345678901234")).toBe("UnionPay");
    expect(cardBrandLabel(undefined, "4111111111111111")).toBe("Visa");
    expect(cardBrandLabel(undefined, "5555555555554444")).toBe("Mastercard");
    expect(cardBrandLabel(undefined, "6011000000000000")).toBe("Discover");
  });
});

describe("sessionLooksUnlocked", () => {
  it("requires a vault key in standalone mode", () => {
    expect(sessionLooksUnlocked(undefined)).toBe(false);
    expect(sessionLooksUnlocked({ unlocked: true })).toBe(false);
    expect(
      sessionLooksUnlocked({ unlocked: true, vaultKeyB64: "abc", mode: "standalone" }),
    ).toBe(true);
  });

  it("treats a native desktop session as unlocked without a local key", () => {
    expect(sessionLooksUnlocked({ unlocked: true, mode: "native" })).toBe(true);
    expect(sessionLooksUnlocked({ unlocked: false, mode: "native" })).toBe(false);
  });
});
