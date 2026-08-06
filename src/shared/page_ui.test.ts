import { describe, expect, it } from "vitest";
import {
  nextPickerIndex,
  overlayEmptyHint,
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
