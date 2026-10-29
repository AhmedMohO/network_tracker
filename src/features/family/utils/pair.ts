import * as Crypto from "expo-crypto";

const SCHEME = "nettrack";
const HOST = "pair";
const TOKEN_BYTES = 16;
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;

function randomHex(bytes: number): string {
  return Array.from(Crypto.getRandomBytes(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The pair token is a bearer secret: whoever holds it reads the child's usage
 * history. `Math.random` is seeded predictably enough on some JS engines to be
 * a real risk here, so this goes through the platform CSPRNG.
 */
export function newPairToken(): string {
  return randomHex(TOKEN_BYTES);
}

/** Distinguishes two devices inside one pair. Not a secret, but no reason to reuse. */
export function newDeviceId(): string {
  return randomHex(TOKEN_BYTES);
}

export function pairLink(token: string, label: string): string {
  return `${SCHEME}://${HOST}?t=${token}&label=${encodeURIComponent(label)}`;
}

/**
 * Parses a deep link into a pairing, or null. Strict on purpose: this runs on
 * whatever URL the OS hands the app, including one an attacker put in a chat
 * message. A wrong scheme, a wrong route, or a token that is not exactly the
 * shape `newPairToken` produces is rejected rather than half-accepted.
 */
export function parsePairLink(url: string): { token: string; label: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${SCHEME}:`) return null;
  // React Native's URL polyfill puts `pair` in `host` for `scheme://pair?x`,
  // but a stricter parser can leave it in `pathname`. Accept either rather
  // than depending on which one is loaded.
  const route = parsed.host || parsed.pathname.replace(/^\/+/, "");
  if (route !== HOST) return null;

  const token = parsed.searchParams.get("t");
  if (!token || !TOKEN_PATTERN.test(token)) return null;

  return { token, label: parsed.searchParams.get("label") ?? "" };
}
