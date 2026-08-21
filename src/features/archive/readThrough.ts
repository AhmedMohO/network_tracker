import type { NetworkFilter } from "@modules/network-usage";

import { sumUsage } from "@/features/usage/aggregate";
import { fetchUsage, type UsageResult } from "@/features/usage/api";
import type { Range } from "@/features/usage/range";
import {
  fetchWifiNetworkUsage,
  type WifiNetworkResult,
} from "@/features/usage/wifiNetworks";
import { mergeSlices } from "@/features/usage/wifiSlices";

import { readArchive, readArchiveByWifiNetwork } from "./db";
import { archiveCutoff, mergeUsage, splitRange } from "./merge";

/**
 * `fetchUsage`, extended backwards past Android's ~90-day retention using the
 * daily archive. Screens call this; the background check and the snapshot
 * itself keep calling `fetchUsage`, which always reads Android.
 *
 * It lives here rather than in `api.ts` so the archive depends on the usage
 * layer and never the other way round.
 *
 * The chart is not covered: the archive stores day totals, not series, so a
 * range older than the cutoff has totals but no bars.
 */
export async function fetchUsageWithArchive(
  range: Range,
  network: NetworkFilter
): Promise<UsageResult> {
  const { archived, live } = splitRange(range, archiveCutoff(Date.now()));
  if (!archived) return fetchUsage(range, network);

  const [oldApps, recent] = await Promise.all([
    readArchive(archived.start, archived.end, network),
    live ? fetchUsage(live, network) : null,
  ]);

  const apps = mergeUsage(oldApps, recent?.apps ?? []);
  return {
    apps,
    totals: sumUsage(apps),
    // Coverage describes what Android returned, so it only ever comes from the
    // live half of the answer.
    coverage: recent?.coverage ?? null,
  };
}

/**
 * `fetchWifiNetworkUsage`, extended backwards the same way
 * `fetchUsageWithArchive` extends `fetchUsage`.
 *
 * The archive matters more here than it does for the plain totals: the
 * transition log is kept for 120 days but Android's per-UID stats are gone in
 * about 90, so past the cutoff the archive is the only place a per-network
 * split still exists at all.
 */
export async function fetchWifiNetworksWithArchive(
  range: Range
): Promise<WifiNetworkResult> {
  const { archived, live } = splitRange(range, archiveCutoff(Date.now()));
  if (!archived) return fetchWifiNetworkUsage(range);

  const [old, recent] = await Promise.all([
    readArchiveByWifiNetwork(archived.start, archived.end),
    live ? fetchWifiNetworkUsage(live) : null,
  ]);

  return {
    networks: mergeSlices(old, recent?.networks ?? []),
    // Coverage describes what Android returned, so — as above — it only ever
    // comes from the live half of the answer.
    coverage: recent?.coverage ?? null,
  };
}
