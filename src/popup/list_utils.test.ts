import { describe, expect, it } from "vitest";
import {
  emptyState,
  escapeHtml,
  nextListIndex,
  positionClass,
  spacedCardNumber,
} from "./list_utils";

describe("escapeHtml", () => {
  it("escapes markup characters", () => {
    expect(escapeHtml(`<a & "b">`)).toBe("&lt;a &amp; &quot;b&quot;&gt;");
  });
});

describe("positionClass", () => {
  it("returns alone/start/end/center", () => {
    expect(positionClass(0, 1)).toBe("pos-alone");
    expect(positionClass(0, 3)).toBe("pos-start");
    expect(positionClass(1, 3)).toBe("pos-center");
    expect(positionClass(2, 3)).toBe("pos-end");
  });
});

describe("spacedCardNumber", () => {
  it("formats last4 groups", () => {
    expect(spacedCardNumber("•••• 4242")).toBe("••••  ••••  ••••  4242");
    expect(spacedCardNumber("")).toBe("••••  ••••  ••••  ••••");
  });
});

describe("emptyState", () => {
  it("includes escaped title and message", () => {
    const html = emptyState("I", "<title>", "msg & more");
    expect(html).toContain("&lt;title&gt;");
    expect(html).toContain("msg &amp; more");
  });
});

describe("nextListIndex", () => {
  it("wraps and handles unset selection", () => {
    expect(nextListIndex(0, 1, 3)).toBe(1);
    expect(nextListIndex(2, 1, 3)).toBe(0);
    expect(nextListIndex(-1, 1, 4)).toBe(0);
    expect(nextListIndex(-1, -1, 4)).toBe(3);
    expect(nextListIndex(0, 1, 0)).toBe(-1);
  });
});
