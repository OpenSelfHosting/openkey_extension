import { describe, expect, it } from "vitest";
import type { DecryptedCollection, DecryptedEntry } from "./types";
import {
  childFolders,
  countEntriesInFolder,
  entriesCountLabel,
  entriesInFolder,
  entryMatchesQuery,
  entryMatchesTags,
  folderMatchesQuery,
  folderStackTo,
  normalizeFolderId,
} from "./vault_scope";

function folder(
  uuid: string,
  parentUuid: string | null,
  name = uuid,
): DecryptedCollection {
  return { uuid, name, icon: "folder", color: null, parentUuid, sortOrder: 0 };
}

function login(
  uuid: string,
  collectionUuid: string | null,
  extra: Partial<DecryptedEntry> = {},
): DecryptedEntry {
  return {
    kind: "login",
    uuid,
    collectionUuid,
    revision: 1,
    title: extra.title ?? uuid,
    username: extra.username ?? "",
    password: "",
    urls: extra.urls ?? [],
    notes: extra.notes ?? "",
    tags: extra.tags ?? [],
    fields: [],
    fieldOrder: [],
    icon: "",
    totp: null,
    attachments: [],
    passkey: null,
  };
}

describe("normalizeFolderId", () => {
  it("maps empty sentinels to root", () => {
    expect(normalizeFolderId(null)).toBeNull();
    expect(normalizeFolderId(undefined)).toBeNull();
    expect(normalizeFolderId("")).toBeNull();
    expect(normalizeFolderId("  ")).toBeNull();
    expect(normalizeFolderId("__root__")).toBeNull();
    expect(normalizeFolderId("null")).toBeNull();
  });

  it("keeps real uuids", () => {
    expect(normalizeFolderId("abc")).toBe("abc");
  });
});

describe("childFolders", () => {
  const tree = [
    folder("work", null),
    folder("home", ""),
    folder("nested", "work"),
    folder("other", undefined as unknown as null),
  ];

  it("shows root folders when parent is missing/empty", () => {
    expect(childFolders(tree, null).map((c) => c.uuid).sort()).toEqual([
      "home",
      "other",
      "work",
    ]);
    expect(childFolders(tree, "").map((c) => c.uuid)).toContain("work");
  });

  it("shows nested children of a folder", () => {
    expect(childFolders(tree, "work").map((c) => c.uuid)).toEqual(["nested"]);
  });
});

describe("entriesInFolder", () => {
  const items = [
    login("a", null, { title: "Root" }),
    login("b", "", { title: "Also root" }),
    login("c", "work", { title: "Work mail" }),
    login("d", "nested", { title: "Nested" }),
  ];

  it("root only includes unfiled logins", () => {
    expect(
      entriesInFolder(items, null, { collections: [{ uuid: "work" }] })
        .map((e) => e.uuid)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  it("flat vault when no collections are known", () => {
    expect(entriesInFolder(items, null).map((e) => e.uuid)).toHaveLength(4);
  });

  it("folder only includes its own logins", () => {
    expect(entriesInFolder(items, "work").map((e) => e.uuid)).toEqual(["c"]);
  });

  it("searching returns every login", () => {
    expect(
      entriesInFolder(items, "work", { searching: true }).map((e) => e.uuid),
    ).toHaveLength(4);
  });
});

describe("filters", () => {
  const e = login("x", null, {
    title: "GitHub",
    username: "ada",
    notes: "2fa",
    urls: ["https://github.com"],
    tags: ["dev", "work"],
  });

  it("matches any selected tag", () => {
    expect(entryMatchesTags(e, [])).toBe(true);
    expect(entryMatchesTags(e, ["dev"])).toBe(true);
    expect(entryMatchesTags(e, ["home"])).toBe(false);
  });

  it("matches query across title username notes urls tags", () => {
    expect(entryMatchesQuery(e, "git")).toBe(true);
    expect(entryMatchesQuery(e, "ADA")).toBe(true);
    expect(entryMatchesQuery(e, "2FA")).toBe(true);
    expect(entryMatchesQuery(e, "github.com")).toBe(true);
    expect(entryMatchesQuery(e, "work")).toBe(true);
    expect(entryMatchesQuery(e, "nope")).toBe(false);
  });

  it("matches folder names", () => {
    expect(folderMatchesQuery(folder("work", null, "Work"), "wor")).toBe(true);
    expect(folderMatchesQuery(folder("work", null, "Work"), "home")).toBe(
      false,
    );
  });
});

describe("folderStackTo", () => {
  const tree = [folder("a", null), folder("b", "a"), folder("c", "b")];

  it("builds root → leaf", () => {
    expect(folderStackTo(tree, "c").map((f) => f.uuid)).toEqual(["a", "b", "c"]);
  });
});

describe("counts", () => {
  const items = [login("a", "work"), login("b", "work"), login("c", "home")];
  it("counts logins in a folder", () => {
    expect(countEntriesInFolder(items, "work")).toBe(2);
    expect(entriesCountLabel(1)).toBe("1 entry");
    expect(entriesCountLabel(2)).toBe("2 entries");
  });
});
