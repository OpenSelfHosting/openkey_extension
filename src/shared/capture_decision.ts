/** Pure capture save/update/dedupe decision (no chrome APIs). */

export type CaptureDecision =
  | { action: "none" }
  | { action: "need_unlock" }
  | { action: "save"; title: string }
  | { action: "update"; uuid: string; title: string };

export type CaptureMatch = {
  uuid: string;
  title: string;
  username: string;
  password: string;
};

export function titleFromUrl(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "") || "Login";
  } catch {
    return "Login";
  }
}

/**
 * Decide whether a password capture should save, update, or no-op.
 * Matches are expected to already be filtered to the page origin.
 */
export function resolveCaptureDecision(
  input: { username: string; password: string; url: string },
  options: { unlocked: boolean; matches: CaptureMatch[] },
): CaptureDecision {
  if (!input.password) return { action: "none" };
  if (!options.unlocked) {
    return { action: "need_unlock" };
  }

  const user = input.username.trim().toLowerCase();
  const sameUser = options.matches.filter((e) => {
    const existing = e.username.trim().toLowerCase();
    if (!user && !existing) return true;
    return existing === user;
  });

  if (!sameUser.length) {
    return { action: "save", title: titleFromUrl(input.url) };
  }

  const identical = sameUser.find((e) => e.password === input.password);
  if (identical) return { action: "none" };

  const target = sameUser[0]!;
  return {
    action: "update",
    uuid: target.uuid,
    title: target.title || titleFromUrl(input.url),
  };
}
