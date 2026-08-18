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
 */
export function limitAlertKey(
  state: Exclude<LimitState, "ok">,
  cycleStart: number,
  limitBytes: number,
  warnAtPercent: number,
  network: LimitNetwork
): string {
  const prefix = network.toLowerCase();
  return state === "over"
    ? `${prefix}:over:${cycleStart}:${limitBytes}`
    : `${prefix}:warn:${cycleStart}:${limitBytes}:${warnAtPercent}`;
}

/** A spike is a property of a day, so its key is the day it was detected on. */
export function spikeAlertKey(dayStart: number, network: LimitNetwork): string {
  const day = new Date(dayStart).toISOString().slice(0, 10);
  return `${network.toLowerCase()}:spike:${day}`;
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
