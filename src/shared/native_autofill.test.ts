import { describe, expect, it } from "vitest";
import {
  dummyAutocomplete,
  nativeAutofillHideCss,
  shouldSuppressNativeAutofill,
} from "./native_autofill";

describe("dummyAutocomplete", () => {
  it("rewrites login tokens Chrome uses for the native dropdown", () => {
    expect(dummyAutocomplete("username")).toBe("off");
    expect(dummyAutocomplete("current-password")).toBe("off");
    expect(dummyAutocomplete("new-password")).toBe("off");
    expect(dummyAutocomplete("")).toBe("off");
  });

  it("leaves OTP and card tokens alone", () => {
    expect(dummyAutocomplete("one-time-code")).toBe("one-time-code");
    expect(dummyAutocomplete("cc-number")).toBe("cc-number");
  });
});

describe("shouldSuppressNativeAutofill", () => {
  it("only targets login username and password fields", () => {
    expect(shouldSuppressNativeAutofill("username")).toBe(true);
    expect(shouldSuppressNativeAutofill("password")).toBe(true);
    expect(shouldSuppressNativeAutofill("card")).toBe(false);
    expect(shouldSuppressNativeAutofill("token")).toBe(false);
  });
});

describe("nativeAutofillHideCss", () => {
  it("hides Chromium's in-field credentials button", () => {
    expect(nativeAutofillHideCss()).toContain(
      "::-webkit-credentials-auto-fill-button",
    );
  });
});
