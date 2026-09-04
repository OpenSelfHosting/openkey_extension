import { describe, expect, it } from "vitest";
import { resolveIconForLogin } from "./favicon_icon";
import { isPngMagic } from "./save_icon";

const PNG_1x1 = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

describe("resolveIconForLogin", () => {
  it("persists a catalog brand without fetching", async () => {
    let fetched = 0;
    const icon = await resolveIconForLogin(
      { title: "GitHub", urls: ["https://github.com"] },
      {
        fetch: async () => {
          fetched += 1;
          throw new Error("should not fetch");
        },
      },
    );
    expect(icon).toBe("brands/github.svg");
    expect(fetched).toBe(0);
  });

  it("keeps a user-chosen brand or lock", async () => {
    expect(
      await resolveIconForLogin({
        existingIcon: "brands/apple.svg",
        urls: ["https://github.com"],
      }),
    ).toBe("brands/apple.svg");
    expect(
      await resolveIconForLogin({
        existingIcon: "material:lock",
        urls: ["https://github.com"],
      }),
    ).toBe("material:lock");
  });

  it("stores a PNG favicon when no brand matches", async () => {
    expect(isPngMagic(PNG_1x1)).toBe(true);
    const icon = await resolveIconForLogin(
      { urls: ["https://www.npmjs.com/login"], pageUrl: "https://www.npmjs.com/login" },
      {
        fetch: async () =>
          new Response(PNG_1x1, {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
        toPng: async (bytes) => bytes,
      },
    );
    expect(icon?.startsWith("custom:favicon:png:")).toBe(true);
  });

  it("upgrades a generic stored key", async () => {
    const icon = await resolveIconForLogin({
      existingIcon: "material:key",
      urls: ["https://github.com"],
    });
    expect(icon).toBe("brands/github.svg");
  });
});
