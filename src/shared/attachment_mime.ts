/** Guess MIME from a filename (mirrors openkey_app attachment_kind). */
export function attachmentContentType(fileName: string): string {
  const ext = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase()
    : "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "pdf":
      return "application/pdf";
    case "txt":
    case "md":
    case "log":
      return "text/plain";
    case "json":
      return "application/json";
    case "csv":
      return "text/csv";
    default:
      return "application/octet-stream";
  }
}

/** Prefer stored MIME, else guess from filename. */
export function resolveAttachmentContentType(
  contentType: string | null | undefined,
  fileName: string,
): string {
  if (contentType && contentType.trim()) return contentType.trim();
  return attachmentContentType(fileName);
}
