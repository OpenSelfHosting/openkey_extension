/** Shared list/layout helpers used by the popup vault UI. */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function positionClass(index: number, length: number): string {
  if (length <= 1) return "pos-alone";
  if (index === 0) return "pos-start";
  if (index === length - 1) return "pos-end";
  return "pos-center";
}

export function spacedCardNumber(masked: string): string {
  const digits = masked.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  if (!last4) return "••••  ••••  ••••  ••••";
  return `••••  ••••  ••••  ${last4}`;
}

export function emptyState(icon: string, title: string, message: string): string {
  return `<div class="empty-state">
    <div class="morph-hero" aria-hidden="true">${icon}</div>
    <div class="empty-title">${escapeHtml(title)}</div>
    <div class="empty-msg">${escapeHtml(message)}</div>
  </div>`;
}

export function skeletonList(count = 4): string {
  const positions = ["pos-start", "pos-center", "pos-center", "pos-end"];
  return `<div class="skeleton-list">${Array.from({ length: count }, (_, i) =>
    `<div class="skeleton-item ${positions[i] ?? "pos-alone"}"></div>`,
  ).join("")}</div>`;
}

/** Arrow-key index for vault list navigation (wraps). */
export function nextListIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return (current + delta + length) % length;
}
