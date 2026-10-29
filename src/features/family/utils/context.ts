/** The shape a heartbeat's own app list carries — enough to resolve a package to a name. */
type WireApp = { pkg: string | null; name: string };

/**
 * Three missed 15-minute heartbeats. Past this, naming a foreground app would
 * be a stale guess dressed up as a current fact — a different, stricter
 * threshold than `isTodayHeartbeat` (`TodayTotals.tsx`), which only asks
 * whether a row belongs on today's calendar day, not whether it is fresh.
 */
export const CONTEXT_STALE_MS = 45 * 60 * 1000;

/** Whether a heartbeat's device context is too old to describe honestly. */
export function isContextStale(at: number, now = Date.now()): boolean {
  return now - at > CONTEXT_STALE_MS;
}

/**
 * The check-in time to reason about, given the child's own claim and the
 * server's stamp for the same row.
 *
 * `payload.at` is the child's `Date.now()` and nothing verifies it. A device
 * whose clock runs 20 minutes fast reports a check-in 20 minutes in the
 * future, so `now - at` stays under the staleness threshold for 65 minutes
 * instead of 45 and goes *negative* for the first 20 — which `formatSpan`
 * clamps up into "1 minute ago", an actively false freshness claim from the
 * one code path whose whole job is to prevent those. Automatic time turned
 * off, a manual clock with the wrong timezone, or a device recovering from a
 * dead battery all produce it, and the parent cannot tell.
 *
 * `serverAt` is the row's `updated_at`, stamped by Postgres when the push
 * landed — the one timestamp neither device can forge. Taking the older of
 * the two is conservative in both directions: a fast child clock falls back
 * to the server's stamp, a slow one keeps its own already-older claim. Null
 * only for a caller with no row to read it from, which falls back to the
 * child's claim rather than inventing a time.
 */
export function checkInAt(at: number, serverAt: number | null): number {
  return serverAt === null ? at : Math.min(at, serverAt);
}

/**
 * The i18n key naming a heartbeat's connection type.
 *
 * Anything that is neither `MOBILE` nor `WIFI` — Ethernet, Bluetooth
 * tethering, a transport this build does not know about, or a genuinely
 * absent network — falls to `contextOffline`, whose copy says "not on mobile
 * data or Wi-Fi" rather than "offline": a device on Ethernet is not offline,
 * and the phase's whole premise is not making false statements. Everything
 * unrecognised must land on a real key here, never on `undefined`.
 */
export function connectionKey(connection: string | null | undefined): string {
  if (connection === "MOBILE") return "family.contextOnMobile";
  if (connection === "WIFI") return "family.contextOnWifi";
  return "family.contextOffline";
}

/**
 * The foreground package's display name: the name carried in the same
 * heartbeat's own app list when the package matches — so a parent whose
 * device never installed the child's app still sees a real name instead of
 * `AppIcon`'s empty state — or the raw package name otherwise. Never fetches
 * anything; the wire payload already carries what it needs.
 */
export function resolveForegroundAppName(
  foregroundPackage: string | null,
  apps: WireApp[]
): string | null {
  if (!foregroundPackage) return null;
  return apps.find((a) => a.pkg === foregroundPackage)?.name ?? foregroundPackage;
}
