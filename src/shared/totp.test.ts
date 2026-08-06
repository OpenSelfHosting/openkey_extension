import { describe, expect, it } from "vitest";
import { generateTotp, parseOtpAuth } from "./totp";

describe("totp", () => {
  it("parses otpauth uris", () => {
    const config = parseOtpAuth(
      "otpauth://totp/Example:ada@example.com?secret=JBSWY3DPEHPK3PXP&period=30&digits=6&algorithm=SHA1",
    );
    expect(config).toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      period: 30,
      digits: 6,
      algorithm: "SHA1",
    });
  });

  it("returns null for invalid uris", () => {
    expect(parseOtpAuth("https://example.com")).toBeNull();
    expect(parseOtpAuth("otpauth://totp/Example")).toBeNull();
  });

  it("generates a 6-digit code", () => {
    const code = generateTotp({ secret: "JBSWY3DPEHPK3PXP" }, 0);
    expect(code).toMatch(/^\d{6}$/);
  });
});
