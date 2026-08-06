import { describe, expect, it } from "vitest";
import { needsSync, selectDirty } from "./dirty";

describe("sync dirty tracking", () => {
  it("treats missing isSynced as dirty", () => {
    expect(needsSync({})).toBe(true);
    expect(needsSync({ isSynced: false })).toBe(true);
    expect(needsSync({ isSynced: true })).toBe(false);
  });

  it("selects only dirty rows for push", () => {
    const rows = [
      { uuid: "a", isSynced: true },
      { uuid: "b", isSynced: false },
      { uuid: "c" },
    ];
    expect(selectDirty(rows).map((r) => r.uuid)).toEqual(["b", "c"]);
  });
});
