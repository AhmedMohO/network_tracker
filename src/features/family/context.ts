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
