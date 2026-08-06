import { describe, expect, it } from "vitest";
import {
  authorityKey,
  bestEntryScore,
  effectivePort,
  matchAndRankByUrls,
  scoreUrlMatch,
} from "./url_match";

describe("url_match", () => {
  const page8444 = "https://main-worker-01.tail319662.ts.net:8444/#/lock";
  const entry5678 = "https://main-worker-01.tail319662.ts.net:5678/";
  const entry8444 = "https://main-worker-01.tail319662.ts.net:8444/";

  it("treats different ports as different sites", () => {
    expect(scoreUrlMatch(entry5678, page8444)).toBe(0);
    expect(bestEntryScore([entry5678], page8444)).toBe(0);
  });

  it("matches the same host:port", () => {
    expect(scoreUrlMatch(entry8444, page8444)).toBeGreaterThan(0);
  });

  it("does not suggest the wrong port first", () => {
    const ranked = matchAndRankByUrls(
      [
        { urls: [entry5678], id: "wrong" },
        { urls: [entry8444], id: "right" },
      ],
      page8444,
    );
    expect(ranked.map((r) => r.id)).toEqual(["right"]);
  });

  it("uses default ports when omitted", () => {
    const a = new URL("https://example.com/path");
    const b = new URL("https://example.com:443/path");
    expect(effectivePort(a)).toBe(443);
    expect(effectivePort(b)).toBe(443);
    expect(authorityKey(a)).toBe(authorityKey(b));
    expect(scoreUrlMatch("https://example.com/", "https://example.com:443/login")).toBeGreaterThan(0);
  });

  it("allows subdomain match only on the same port", () => {
    expect(
      scoreUrlMatch(
        "https://example.com:8444/",
        "https://app.example.com:8444/login",
      ),
    ).toBe(1);
    expect(
      scoreUrlMatch(
        "https://example.com:5678/",
        "https://app.example.com:8444/login",
      ),
    ).toBe(0);
  });

  it("treats www and apex as the same host", () => {
    expect(
      scoreUrlMatch("https://www.example.com/", "https://example.com/login"),
    ).toBe(2);
    expect(
      scoreUrlMatch("https://example.com/", "https://www.example.com/login"),
    ).toBe(2);
  });
});
