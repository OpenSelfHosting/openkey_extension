import { describe, expect, it } from "vitest";
import {
  resolveCaptureDecision,
  titleFromUrl,
} from "./capture_decision";

describe("resolveCaptureDecision", () => {
  const url = "https://example.com/login";
  const matches = [
    {
      uuid: "u1",
      title: "Example",
      username: "alice",
      password: "old",
    },
  ];

  it("derives title from host", () => {
    expect(titleFromUrl(url)).toBe("example.com");
  });

  it("no-ops without a password", () => {
    expect(
      resolveCaptureDecision(
        { username: "a", password: "", url },
        { unlocked: true, matches },
      ),
    ).toEqual({ action: "none" });
  });

  it("asks to unlock when vault is locked", () => {
    expect(
      resolveCaptureDecision(
        { username: "alice", password: "new", url },
        { unlocked: false, matches },
      ),
    ).toEqual({ action: "need_unlock" });
  });

  it("saves when no matching username", () => {
    expect(
      resolveCaptureDecision(
        { username: "bob", password: "x", url },
        { unlocked: true, matches },
      ),
    ).toEqual({ action: "save", title: "example.com" });
  });

  it("no-ops when password already stored", () => {
    expect(
      resolveCaptureDecision(
        { username: "alice", password: "old", url },
        { unlocked: true, matches },
      ),
    ).toEqual({ action: "none" });
  });

  it("updates when same user with new password", () => {
    expect(
      resolveCaptureDecision(
        { username: "alice", password: "new", url },
        { unlocked: true, matches },
      ),
    ).toEqual({ action: "update", uuid: "u1", title: "Example" });
  });
});
