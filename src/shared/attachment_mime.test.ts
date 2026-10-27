import { describe, expect, it } from "vitest";
import {
  attachmentContentType,
  resolveAttachmentContentType,
} from "./attachment_mime";

describe("attachmentContentType", () => {
  it("maps common extensions", () => {
    expect(attachmentContentType("a.PNG")).toBe("image/png");
    expect(attachmentContentType("note.txt")).toBe("text/plain");
    expect(attachmentContentType("clip.mp4")).toBe("video/mp4");
    expect(attachmentContentType("x")).toBe("application/octet-stream");
  });

  it("prefers stored content type", () => {
    expect(resolveAttachmentContentType("image/webp", "x.bin")).toBe(
      "image/webp",
    );
    expect(resolveAttachmentContentType(null, "doc.pdf")).toBe(
      "application/pdf",
    );
  });
});
