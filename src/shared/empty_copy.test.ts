import { describe, expect, it } from "vitest";
import { vaultEmptyMessage } from "./empty_copy";

describe("vaultEmptyMessage", () => {
  it("prefer search/filter hints", () => {
    expect(
      vaultEmptyMessage({
        tab: "vault",
        searching: true,
        filtered: false,
        native: true,
      }),
    ).toMatch(/search/);
    expect(
      vaultEmptyMessage({
        tab: "cards",
        searching: false,
        filtered: true,
        native: false,
      }),
    ).toMatch(/filter/);
  });

  it("guides native mode users to the desktop app", () => {
    expect(
      vaultEmptyMessage({
        tab: "cards",
        searching: false,
        filtered: false,
        native: true,
      }),
    ).toMatch(/desktop app/);
  });

  it("suggests create/sync in standalone mode", () => {
    expect(
      vaultEmptyMessage({
        tab: "secrets",
        searching: false,
        filtered: false,
        native: false,
      }),
    ).toMatch(/API token/);
  });
});
