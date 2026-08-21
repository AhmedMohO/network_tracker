import { sumUsage, type AppUsage } from "./aggregate";

/**
 * One Wi-Fi network's share of a range.
 *
 * `ssid` is `null` for bytes that cannot be attributed: everything before
 * per-network tracking was switched on, plus any gap where the watch was not
 * running. Callers render that as its own row rather than hiding it — the
 * per-network rows have to add up to the Wi-Fi total the rest of the app
 * shows, or two screens contradict each other.
 */
export type WifiNetworkSlice = {
  ssid: string | null;
  apps: AppUsage[];
  totals: { download: number; upload: number; total: number };
};

/**
 * The pure half of per-network usage, kept apart from `./wifiNetworks` — which
 * imports both the native module and `@/i18n` at module scope. `dailySeries`
 * and `fromPayload` need these functions and are unit-tested without either;
 * `fromPayload`'s own doc comment records what happens when a module in that
 * chain reaches for `@/i18n` (jest-expo does not stub the `expo-sqlite/kv-store`
 * it pulls in, and the tests crash on import).
 */

/**
 * Merges slices from two sources — typically the archive and a live query —
 * summing per network and per app.
 */
export function mergeSlices(
  a: WifiNetworkSlice[],
  b: WifiNetworkSlice[]
): WifiNetworkSlice[] {
  const byName = new Map<string | null, AppUsage[]>();
  for (const slice of [...a, ...b]) {
    byName.set(slice.ssid, [...(byName.get(slice.ssid) ?? []), ...slice.apps]);
  }

  // A slice can carry totals with no app list at all — that is exactly what a
  // child's synced payload is (`wifiNetworksFromPayload`) — so the totals are
  // summed independently of the app rows rather than derived from them.
  const totalsByName = new Map<string | null, ReturnType<typeof sumUsage>>();
  for (const slice of [...a, ...b]) {
    const running = totalsByName.get(slice.ssid) ?? {
      download: 0,
      upload: 0,
      total: 0,
    };
    totalsByName.set(slice.ssid, {
      download: running.download + slice.totals.download,
      upload: running.upload + slice.totals.upload,
      total: running.total + slice.totals.total,
    });
  }

  return [...byName.entries()]
    .map(([ssid, rows]) => {
      const byUid = new Map<number, AppUsage>();
      for (const row of rows) {
        const existing = byUid.get(row.uid);
        // Copied, never referenced: these rows belong to the caller's arrays.
        if (!existing) {
          byUid.set(row.uid, { ...row });
          continue;
        }
        existing.download += row.download;
        existing.upload += row.upload;
        existing.total += row.total;
        existing.foreground += row.foreground;
        existing.background += row.background;
      }
      const apps = [...byUid.values()].sort((x, y) => y.total - x.total);
      const totals = totalsByName.get(ssid) ?? sumUsage(apps);
      for (const app of apps) {
        app.percentage = totals.total === 0 ? 0 : (app.total / totals.total) * 100;
      }
      return { ssid, apps, totals };
    })
    .sort((x, y) => y.totals.total - x.totals.total);
}

/**
 * Narrows a set of slices to one app: same networks, but each slice's totals
 * are that app's bytes on that network. Networks the app never used drop out.
 *
 * `apps` comes back empty because the app is now the subject of the slice, not
 * a row inside it — the detail screen shows one bar per network, not a list.
 */
export function sliceApp(
  networks: WifiNetworkSlice[],
  uid: number
): WifiNetworkSlice[] {
  return networks
    .map((n) => {
      const app = n.apps.find((a) => a.uid === uid);
      return {
        ssid: n.ssid,
        apps: [],
        totals: {
          download: app?.download ?? 0,
          upload: app?.upload ?? 0,
          total: app?.total ?? 0,
        },
      };
    })
    .filter((n) => n.totals.total > 0)
    .sort((x, y) => y.totals.total - x.totals.total);
}
