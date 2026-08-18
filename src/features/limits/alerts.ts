import type { LimitState } from "./limits";

/**
 * An alert's identity is *what* was crossed, not just when. Encoding the limit
 * and the warn percentage means raising or lowering the limit mid-cycle is a
 * genuinely new threshold that re-arms, while an unchanged one stays quiet.
 */
export function limitAlertKey(
  state: Exclude<LimitState, "ok">,
  cycleStart: number,
  limitBytes: number,
  warnAtPercent: number
): string {
  return state === "over"
    ? `over:${cycleStart}:${limitBytes}`
    : `warn:${cycleStart}:${limitBytes}:${warnAtPercent}`;
}

/** A spike is a property of a day, so its key is the day it was detected on. */
export function spikeAlertKey(dayStart: number): string {
  return `spike:${new Date(dayStart).toISOString().slice(0, 10)}`;
}

/**
 * Should `key` fire, and what should be remembered afterwards?
 *
 * More than one key is remembered at a time so a spike alert cannot un-arm a
 * limit alert. Keys that could no longer be produced — a limit key from a
 * finished cycle, a spike key from an earlier day — are dropped, which is what
 * keeps the list bounded and what re-arms every alert on a new cycle.
 */
export function decideAlert(
  alertedKeys: string[],
  key: string,
  cycleStart: number,
  todaySpikeKey: string
): { fire: boolean; alertedKeys: string[] } {
  const live = alertedKeys.filter((k) =>
    k.startsWith("spike:")
      ? k === todaySpikeKey
      : k.split(":")[1] === String(cycleStart)
  );
  return live.includes(key)
    ? { fire: false, alertedKeys: live }
    : { fire: true, alertedKeys: [...live, key] };
}
