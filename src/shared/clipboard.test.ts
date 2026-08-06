import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelClipboardClear, copyText } from "./clipboard";

describe("copyText", () => {
  afterEach(() => {
    cancelClipboardClear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("writes to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: { writeText, readText: vi.fn() },
    });
    await copyText("secret");
    expect(writeText).toHaveBeenCalledWith("secret");
  });

  it("clears after delay when clipboard still matches", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue("secret");
    vi.stubGlobal("navigator", {
      clipboard: { writeText, readText },
    });
    await copyText("secret", { clearAfterMs: 1000 });
    expect(writeText).toHaveBeenCalledWith("secret");
    await vi.advanceTimersByTimeAsync(1000);
    expect(readText).toHaveBeenCalled();
    expect(writeText).toHaveBeenLastCalledWith("");
  });

  it("does not clear when user copied something else", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue("other");
    vi.stubGlobal("navigator", {
      clipboard: { writeText, readText },
    });
    await copyText("secret", { clearAfterMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("secret");
  });
});
