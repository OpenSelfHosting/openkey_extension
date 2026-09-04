import { describe, expect, it } from "vitest";
import {
  asLoginFromNative,
  isUnsupportedNativeType,
  mapNativeCollections,
  matchSecretsForOrigin,
  nativeErrorMessage,
  normalizeCard,
  normalizeCrypto,
  normalizeLogin,
  normalizeSecret,
  parseVaultItem,
  secretKindLabelFallback,
  titleFromUrl,
  urlsFor,
} from "./mapping";
import { ReservedCollections } from "../../shared/types";
import type { DecryptedSecret } from "../../shared/types";

const row = {
  uuid: "u1",
  collectionUuid: null as string | null,
  revision: 3,
};

function secret(
  partial: Partial<DecryptedSecret> & Pick<DecryptedSecret, "name" | "host">,
): DecryptedSecret {
  return {
    kind: "secret",
    type: "secret",
    uuid: partial.uuid ?? "s1",
    collectionUuid: ReservedCollections.secrets,
    revision: 1,
    name: partial.name,
    secretKind: partial.secretKind ?? "other",
    username: partial.username ?? "",
    host: partial.host,
    publicKey: "",
    secret: partial.secret ?? "tok",
    passphrase: "",
    notes: "",
    device: "",
  };
}

describe("normalizeLogin", () => {
  it("fills defaults for missing optional fields", () => {
    const entry = normalizeLogin(row, {
      title: "Acme",
      username: "a@b.c",
      password: "pw",
      urls: ["https://acme.test"],
    });
    expect(entry.kind).toBe("login");
    expect(entry.notes).toBe("");
    expect(entry.tags).toEqual([]);
    expect(entry.totp).toBeNull();
    expect(entry.passkey).toBeNull();
    expect(entry.revision).toBe(3);
  });
});

describe("parseVaultItem", () => {
  it("classifies by payload type", () => {
    expect(
      parseVaultItem(row, { type: "card", name: "Visa", number: "4111" })?.kind,
    ).toBe("card");
    expect(
      parseVaultItem(row, {
        type: "crypto",
        name: "Eth",
        network: "ethereum",
        address: "0x1",
      })?.kind,
    ).toBe("crypto");
    expect(
      parseVaultItem(row, {
        type: "secret",
        name: "Token",
        kind: "apiToken",
        secret: "x",
      })?.kind,
    ).toBe("secret");
  });

  it("classifies by reserved collection when type is missing", () => {
    expect(
      parseVaultItem(
        { ...row, collectionUuid: ReservedCollections.wallets },
        { name: "Card" },
      )?.kind,
    ).toBe("card");
    expect(
      parseVaultItem(
        { ...row, collectionUuid: ReservedCollections.crypto },
        { name: "Wallet", network: "bitcoin", address: "bc1" },
      )?.kind,
    ).toBe("crypto");
    expect(
      parseVaultItem(
        { ...row, collectionUuid: ReservedCollections.secrets },
        { name: "Key", kind: "sshKey" },
      )?.kind,
    ).toBe("secret");
  });

  it("defaults to login for personal collections", () => {
    const login = parseVaultItem(row, {
      title: "Site",
      username: "u",
      password: "p",
      urls: ["https://a.test"],
    });
    expect(login?.kind).toBe("login");
  });

  it("normalizes cards/crypto/secrets with defaults", () => {
    const card = normalizeCard(row, { name: "N", number: "1" });
    expect(card.holder).toBe("");
    expect(card.type).toBe("card");
    expect(card.bank).toBeUndefined();

    const crypto = normalizeCrypto(row, {
      name: "W",
      network: "other",
      address: "a",
      folder: "Cold",
    });
    expect(crypto.privateKey).toBe("");
    expect(crypto.seedPhrase).toBe("");
    expect(crypto.folder).toBe("Cold");

    const sec = normalizeSecret(row, {
      type: "secret",
      name: "S",
      kind: "ssh_key",
    });
    expect(sec.secretKind).toBe("sshKey");
  });
});

describe("asLoginFromNative", () => {
  it("passes through DecryptedEntry logins", () => {
    const login = normalizeLogin(row, {
      title: "T",
      username: "u",
      password: "p",
      urls: [],
    });
    expect(asLoginFromNative(login)).toBe(login);
  });

  it("coerces plain native blobs", () => {
    const coerced = asLoginFromNative({
      uuid: "n1",
      title: "Native",
      username: "bob",
      password: "secret",
      urls: ["https://ex.test"],
    });
    expect(coerced.kind).toBe("login");
    expect(coerced.uuid).toBe("n1");
    expect(coerced.username).toBe("bob");
    expect(coerced.passkey).toBeNull();
  });
});

describe("matchSecretsForOrigin", () => {
  const origin = "https://api.example.com/v1";

  it("ranks related hosts and boosts apiToken", () => {
    const ranked = matchSecretsForOrigin(
      [
        secret({ name: "other", host: "unrelated.test", secret: "a" }),
        secret({
          name: "api",
          host: "example.com",
          secretKind: "apiToken",
          secret: "b",
        }),
        secret({ name: "sub", host: "api.example.com", secret: "c" }),
      ],
      origin,
    );
    // Both "api" and "sub" are related-host matches (+100); apiToken adds +10.
    expect(ranked[0]!.name).toBe("api");
    expect(ranked.map((s) => s.name).slice(0, 2)).toEqual(["api", "sub"]);
    expect(ranked.map((s) => s.name)).not.toContain("other");
  });

  it("falls back to all secrets when nothing matches", () => {
    const ranked = matchSecretsForOrigin(
      [secret({ name: "z", host: "elsewhere.test", secret: "" })],
      origin,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.name).toBe("z");
  });

  it("handles invalid origins without throwing", () => {
    expect(
      matchSecretsForOrigin(
        [secret({ name: "x", host: "a.com", secret: "1" })],
        "not a url",
      ),
    ).toHaveLength(1);
  });
});

describe("titleFromUrl / urlsFor", () => {
  it("strips www and returns host as title", () => {
    expect(titleFromUrl("https://www.example.com/path")).toBe("example.com");
  });

  it("returns Login for invalid urls", () => {
    expect(titleFromUrl(":::")).toBe("Login");
  });

  it("returns origin for valid urls and empty for blank", () => {
    expect(urlsFor("https://ex.test/foo?q=1")).toEqual(["https://ex.test"]);
    expect(urlsFor("  ")).toEqual([]);
    expect(urlsFor("not-a-url")).toEqual(["not-a-url"]);
  });
});

describe("secretKindLabelFallback", () => {
  it("labels known kinds", () => {
    expect(secretKindLabelFallback("sshKey")).toBe("SSH key");
    expect(secretKindLabelFallback("apiToken")).toBe("API token");
    expect(secretKindLabelFallback("envSnippet")).toBe(".env");
    expect(secretKindLabelFallback("other")).toBe("Secret");
  });
});

describe("mapNativeCollections", () => {
  it("drops reserved ids and normalizes empty parents", () => {
    const folders = mapNativeCollections([
      {
        uuid: ReservedCollections.wallets,
        name: "Wallets",
        parentUuid: null,
        sortOrder: 0,
      },
      {
        uuid: "work",
        name: "Work",
        parentUuid: "",
        icon: "material:folder",
        sortOrder: 2,
      },
      {
        uuid: "home",
        name: "Home",
        parentUuid: null,
        sortOrder: 1,
      },
    ]);
    expect(folders.map((c) => c.uuid)).toEqual(["home", "work"]);
    expect(folders[0].parentUuid).toBeNull();
    expect(folders[1].parentUuid).toBeNull();
  });
});

describe("nativeErrorMessage", () => {
  it("maps timeouts and oversized responses", () => {
    expect(nativeErrorMessage("Native host timeout")).toMatch(/desktop app/);
    expect(nativeErrorMessage("Vault response too large")).toMatch(/too large/);
  });

  it("treats Unknown type as an older desktop, not a vault crash", () => {
    expect(isUnsupportedNativeType("Unknown type")).toBe(true);
    expect(isUnsupportedNativeType("Native host timeout")).toBe(false);
  });
});
