/** The cumulative-since-boot counters `getDeviceCounters()` returns. */
export type Counters = {
  mobileRx: number;
  mobileTx: number;
  totalRx: number;
  totalTx: number;
};

export type Sample = { down: number; up: number };

/** `TrafficStats.UNSUPPORTED`: the counter is not available on this device. */
const UNSUPPORTED = -1;

/**
 * Roughly 4 Gbit/s. Nothing a phone's radio or Wi-Fi chip can actually reach,
 * so anything above it is a bad counter read — Phase 0 Q5 recorded a ~1.1 GB/s
 * jump and an equal drop on an idle device.
 */
const MAX_PLAUSIBLE_BYTES_PER_SECOND = 500_000_000;

/**
 * Device-wide throughput between two counter readings, or null when the pair
 * cannot honestly be turned into a rate.
 *
 * Only the *total* counters are read. Phase 0 Q5 found this device's mobile
 * counters reporting impossible values while the totals stayed correct, so
 * there is no live mobile/Wi-Fi split here — a wrong split is worse than none.
 */
export function rateBetween(
  previous: Counters,
  current: Counters,
  elapsedMs: number
): Sample | null {
  if (elapsedMs <= 0) return null;
  if (current.totalRx <= UNSUPPORTED || current.totalTx <= UNSUPPORTED) return null;

  const perSecond = (a: number, b: number) => ((b - a) / elapsedMs) * 1000;
  const down = perSecond(previous.totalRx, current.totalRx);
  const up = perSecond(previous.totalTx, current.totalTx);

  // Counters are cumulative since boot; a decrease means a reboot, not
  // negative traffic. Drop the sample and start again from this reading.
  if (down < 0 || up < 0) return null;
  if (down > MAX_PLAUSIBLE_BYTES_PER_SECOND || up > MAX_PLAUSIBLE_BYTES_PER_SECOND) {
    return null;
  }

  return { down, up };
}
