import { describe, expect, it } from "vitest";
import {
  AUTOFILL_MANAGE_ID,
  AUTOFILL_MAX_CREDENTIALS,
  AUTOFILL_PASSWORD_MASKED,
  AUTOFILL_SUGGEST_ID,
  AUTOFILL_UNLOCK_ID,
  autofillLoginDisplayName,
  autofillTheme,
  loginAutofillItems,
  nextPickerIndex,
  overlayEmptyHint,
  shouldSuggestPassword,
} from "./page_ui";

describe("nextPickerIndex", () => {
  it("wraps forward and backward", () => {
    expect(nextPickerIndex(0, 1, 3)).toBe(1);
    expect(nextPickerIndex(2, 1, 3)).toBe(0);
    expect(nextPickerIndex(0, -1, 3)).toBe(2);
  });

  it("handles empty and unset selection", () => {
    expect(nextPickerIndex(0, 1, 0)).toBe(-1);
    expect(nextPickerIndex(-1, 1, 4)).toBe(0);
    expect(nextPickerIndex(-1, -1, 4)).toBe(3);
  });
});

describe("overlayEmptyHint", () => {
  it("asks to unlock when locked", () => {
    expect(overlayEmptyHint(false, "password")).toMatch(/Unlock OpenKey/);
    expect(overlayEmptyHint(false, "card")).toMatch(/Unlock OpenKey/);
  });

  it("describes empty vault kinds when unlocked", () => {
    expect(overlayEmptyHint(true, "password")).toMatch(/No logins/);
    expect(overlayEmptyHint(true, "username")).toMatch(/No logins/);
    expect(overlayEmptyHint(true, "card")).toMatch(/No cards/);
    expect(overlayEmptyHint(true, "token")).toMatch(/No matching secrets/);
  });
});

describe("autofillLoginDisplayName", () => {
  it("prefers username then title", () => {
    expect(
      autofillLoginDisplayName({ uuid: "1", username: "ada", title: "Site" }),
    ).toBe("ada");
    expect(autofillLoginDisplayName({ uuid: "1", title: "Site" })).toBe("Site");
    expect(autofillLoginDisplayName({ uuid: "1" })).toBe("Login");
  });
});

describe("shouldSuggestPassword", () => {
  it("matches Android: empty matches or new-password, only with a password field", () => {
    expect(
      shouldSuggestPassword({
        hasPasswordField: true,
        matchCount: 0,
        hasNewPassword: false,
      }),
    ).toBe(true);
    expect(
      shouldSuggestPassword({
        hasPasswordField: true,
        matchCount: 2,
        hasNewPassword: true,
      }),
    ).toBe(true);
    expect(
      shouldSuggestPassword({
        hasPasswordField: true,
        matchCount: 2,
        hasNewPassword: false,
      }),
    ).toBe(false);
    expect(
      shouldSuggestPassword({
        hasPasswordField: false,
        matchCount: 0,
        hasNewPassword: false,
      }),
    ).toBe(false);
  });
});

describe("loginAutofillItems", () => {
  it("shows only Unlock OpenKey when locked", () => {
    const items = loginAutofillItems({
      unlocked: false,
      entries: [{ uuid: "a", username: "ada" }],
      includeSuggest: true,
    });
    expect(items).toEqual([
      expect.objectContaining({
        id: AUTOFILL_UNLOCK_ID,
        title: "Unlock OpenKey",
        row: "action",
      }),
    ]);
  });

  it("caps credentials and appends Suggest + Manage like Android", () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      uuid: `e${i}`,
      username: `user${i}`,
    }));
    const items = loginAutofillItems({
      unlocked: true,
      entries,
      includeSuggest: true,
    });
    const creds = items.filter((i) => i.row === "credential");
    expect(creds).toHaveLength(AUTOFILL_MAX_CREDENTIALS);
    expect(creds[0]?.subtitle).toBe(AUTOFILL_PASSWORD_MASKED);
    expect(items.map((i) => i.id).slice(-2)).toEqual([
      AUTOFILL_SUGGEST_ID,
      AUTOFILL_MANAGE_ID,
    ]);
  });

  it("omits Suggest password when includeSuggest is false", () => {
    const items = loginAutofillItems({
      unlocked: true,
      entries: [{ uuid: "a", username: "ada" }],
      includeSuggest: false,
    });
    expect(items.map((i) => i.id)).toEqual(["a", AUTOFILL_MANAGE_ID]);
    expect(items.at(-1)?.trailing).toBe(false);
  });

  it("passes brand imageSrc from a stored icon", () => {
    const items = loginAutofillItems({
      unlocked: true,
      entries: [
        {
          uuid: "a",
          username: "ada",
          icon: "brands/github.svg",
        },
      ],
      includeSuggest: false,
    });
    expect(items[0]?.imageSrc).toMatch(/brands\/github\.svg$/);
    expect(items[0]?.backdrop).toBe(false);
  });

  it("uses a material glyph plate when no brand icon is stored", () => {
    const items = loginAutofillItems({
      unlocked: true,
      entries: [{ uuid: "a", username: "ada", icon: "material:key" }],
      includeSuggest: false,
    });
    expect(items[0]?.imageSrc).toBeUndefined();
    expect(items[0]?.backdrop).toBe(true);
    expect(items[0]?.glyphPath).toBeTruthy();
  });

  it("replaces a generic key with the site brand or favicon", () => {
    const github = loginAutofillItems({
      unlocked: true,
      entries: [
        {
          uuid: "a",
          username: "ada",
          icon: "material:key",
          urls: ["https://github.com/login"],
        },
      ],
      includeSuggest: false,
    });
    expect(github[0]?.imageSrc).toMatch(/brands\/github\.svg$/);
    expect(github[0]?.backdrop).toBe(false);

    const npm = loginAutofillItems({
      unlocked: true,
      entries: [
        {
          uuid: "b",
          username: "asimawdah",
          icon: "material:key",
        },
      ],
      includeSuggest: false,
      pageUrl: "https://www.npmjs.com/login",
    });
    expect(npm[0]?.imageSrc).toBe(
      "https://www.google.com/s2/favicons?sz=64&domain=npmjs.com",
    );
  });
});

describe("autofillTheme", () => {
  it("returns light and dark Material Expressive surfaces", () => {
    expect(autofillTheme(false).secondaryContainer).toBe("#d1e8d7");
    expect(autofillTheme(true).secondaryContainer).toBe("#2a4034");
    expect(autofillTheme(true).dark).toBe(true);
  });
});
