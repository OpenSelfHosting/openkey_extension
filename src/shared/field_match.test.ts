import { describe, expect, it } from "vitest";
import {
  fieldHintText,
  isAutofillIgnored,
  isLikelyTokenField,
  isLikelyUsernameField,
  isNewPasswordField,
  selectPreferredIndex,
} from "./field_match";

describe("isLikelyUsernameField", () => {
  it("accepts email type and autocomplete", () => {
    expect(isLikelyUsernameField({ type: "email" })).toBe(true);
    expect(isLikelyUsernameField({ type: "text", autocomplete: "username" })).toBe(
      true,
    );
  });

  it("rejects passwords and unrelated text", () => {
    expect(isLikelyUsernameField({ type: "password" })).toBe(false);
    expect(
      isLikelyUsernameField({ type: "text", hint: "search query" }),
    ).toBe(false);
  });

  it("matches common username hints", () => {
    expect(
      isLikelyUsernameField({
        type: "text",
        hint: fieldHintText(["email_address", "Your email"]),
      }),
    ).toBe(true);
  });
});

describe("isNewPasswordField", () => {
  it("detects Android new-password hints", () => {
    expect(isNewPasswordField({ autocomplete: "new-password" })).toBe(true);
    expect(isNewPasswordField({ hint: "new_password" })).toBe(true);
    expect(isNewPasswordField({ hint: "newpassword" })).toBe(true);
    expect(isNewPasswordField({ autocomplete: "current-password" })).toBe(
      false,
    );
  });
});

describe("isLikelyTokenField", () => {
  it("detects API token naming", () => {
    expect(isLikelyTokenField("api key")).toBe(true);
    expect(isLikelyTokenField("personal access token")).toBe(true);
    expect(isLikelyTokenField("full name")).toBe(false);
  });
});

describe("selectPreferredIndex", () => {
  it("prefers explicit then active then first", () => {
    expect(selectPreferredIndex(3, 2, 0)).toBe(2);
    expect(selectPreferredIndex(3, null, 1)).toBe(1);
    expect(selectPreferredIndex(3, null, null)).toBe(0);
    expect(selectPreferredIndex(0, 0, 0)).toBe(-1);
  });
});

describe("isAutofillIgnored", () => {
  it("detects common ignore attributes on self or ancestor", () => {
    const plain = {
      closest: () => null,
    } as unknown as Element;
    expect(isAutofillIgnored(plain)).toBe(false);

    const ignored = {
      closest: (sel: string) =>
        sel.includes("data-bwignore") ? ignored : null,
    } as unknown as Element;
    expect(isAutofillIgnored(ignored)).toBe(true);
  });
});
