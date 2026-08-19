import type { LimitNetwork, LimitState } from "./limits";

/**
 * Every key is `<network>:<kind>:<scope>[:...]`, so one parse tells you which
 * network an alert belongs to and whether it is still live.
 */
const NETWORKS = ["mobile", "wifi"];

/**
 * An alert's identity is *what* was crossed, not just when. Encoding the limit
 * and the warn percentage means raising or lowering the limit mid-cycle is a
 * genuinely new threshold that re-arms, while an unchanged one stays quiet.
 *
 * `deviceId` (default `""`, this device) is appended, not prefixed: `decideAlert`
 * splits on `:` and reads field 0 (network) and field 2 (scope) to decide
 * liveness. Prefixing would shift those fields and make a child's key parse as
 * an unrecognised network, silently dropping it from `live` and re-notifying
 * every run. Appending leaves every existing field where `decideAlert` expects
 * it — including the unsuffixed key this device's own alerts already used,
 * which stays byte-for-byte identical so already-fired keys are not lost on
 * upgrade — while still keeping each child's own device fully namespaced from
 * this device's and from every other child's.
 */
export function limitAlertKey(
  state: Exclude<LimitState, "ok">,
  cycleStart: number,
  limitBytes: number,
  warnAtPercent: number,
  network: LimitNetwork,
  deviceId = ""
): string {
  const prefix = network.toLowerCase();
  const suffix = deviceId ? `:${deviceId}` : "";
  return state === "over"
    ? `${prefix}:over:${cycleStart}:${limitBytes}${suffix}`
    : `${prefix}:warn:${cycleStart}:${limitBytes}:${warnAtPercent}${suffix}`;
}

/**
 * A spike is a property of a day, so its key is the day it was detected on.
 * `deviceId` follows the same append-only rule as `limitAlertKey` above.
 */
export function spikeAlertKey(
  dayStart: number,
  network: LimitNetwork,
  deviceId = ""
): string {
  const day = new Date(dayStart).toISOString().slice(0, 10);
  const suffix = deviceId ? `:${deviceId}` : "";
  return `${network.toLowerCase()}:spike:${day}${suffix}`;
}

/**
 * Should `key` fire, and what should be remembered afterwards?
 *
 * More than one key is remembered at a time so a spike alert cannot un-arm a
 * limit alert, and mobile cannot un-arm Wi-Fi. Keys that could no longer be
 * produced — a limit key from a finished cycle, a spike key from an earlier
 * day, a key in a format this version no longer writes — are dropped, which is
 * what keeps the list bounded and what re-arms every alert on a new cycle.
 *
 * Both networks share `cycleStart`, so liveness is decided per key without
 * caring which network it came from.
 */
export function decideAlert(
  alertedKeys: string[],
  key: string,
  cycleStart: number,
  todaySpikeKey: string
): { fire: boolean; alertedKeys: string[] } {
  const [, , today] = todaySpikeKey.split(":");
  const live = alertedKeys.filter((k) => {
    const [network, kind, scope] = k.split(":");
    if (!NETWORKS.includes(network)) return false;
    return scope === (kind === "spike" ? today : String(cycleStart));
  });
  return live.includes(key)
    ? { fire: false, alertedKeys: live }
    : { fire: true, alertedKeys: [...live, key] };
}

const STALE_MS = 3 * 60 * 60 * 1000;
const QUIET_MS = 24 * 60 * 60 * 1000;

/**
 * A child's `Snapshot.updatedAt` is stamped by Postgres — the one clock every
 * paired device shares — so comparing it against `now` (also this device's
 * idea of the present) can't be thrown off by one child's device clock being
 * wrong. Data older than 3 hours says nothing about the present: the child
 * may simply not have checked in, not stopped using data, so alerting from it
 * would report a false certainty.
 */
export function isStale(updatedAt: number, now: number): boolean {
  return now - updatedAt > STALE_MS;
}

/**
 * Should a "this child has gone quiet" notice fire, and what `lastSeen` value
 * should be remembered as already notified? One-shot per `lastSeen`, exactly
 * like `syncErrorNotifiedAt` beside `lastSyncErrorAt` in `backgroundCheck.ts`:
 * a child that resumes and later goes quiet again reaches a new `lastSeen`,
 * so it notifies again, but the same silence is only ever reported once.
 * `decideAlert`'s array doesn't fit this — its pruning is keyed to a network
 * and a billing cycle, not a device going quiet — so this is a dedicated,
 * equally pure decision instead.
 */
export function decideQuietChild(
  lastSeen: number,
  now: number,
  notifiedAt: number | undefined
): boolean {
  return now - lastSeen > QUIET_MS && notifiedAt !== lastSeen;
}
