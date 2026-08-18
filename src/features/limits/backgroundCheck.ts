import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import i18n from "@/i18n";
import { fetchUsage } from "@/features/usage/api";
import { formatBytes } from "@/features/usage/format";
import { presetRange } from "@/features/usage/range";
import { loadSettings, saveSettings } from "@/features/usage/settings";

import { decideAlert, limitAlertKey, spikeAlertKey } from "./alerts";
import {
  cycleRanges,
  detectSpike,
  limitStatus,
  type LimitNetwork,
} from "./limits";
import { notify } from "./notify";

export const USAGE_CHECK_TASK = "usage-threshold-check";

const DAY = 86_400_000;
const HISTORY_DAYS = 14;

/**
 * One alert per threshold per cycle. Without this, a crossed threshold would
 * re-notify every time the background task runs. The decision is pure and
 * lives in `alerts.ts`; this function is only the storage around it.
 */
async function alertOnce(
  key: string,
  cycleStart: number,
  todaySpikeKey: string,
  title: string,
  body: string
) {
  const settings = await loadSettings();
  const decision = decideAlert(
    settings.alertedKeys,
    key,
    cycleStart,
    todaySpikeKey
  );
  if (!decision.fire) {
    // decideAlert prunes stale keys from a finished cycle on every call, even
    // when nothing fires. Persist that pruning so those keys don't sit in
    // storage indefinitely — but only when pruning actually removed
    // something, not on every no-op check.
    if (decision.alertedKeys.length !== settings.alertedKeys.length) {
      await saveSettings({ alertedKeys: decision.alertedKeys });
    }
    return "quiet" as const;
  }
  await notify(title, body);
  await saveSettings({ alertedKeys: decision.alertedKeys });
  return "posted" as const;
}

/**
 * One network's limit, then — only if that stayed silent — its spike scan.
 *
 * A crossed threshold ends the check for this network whether it notified or
 * was already remembered: the spike scan costs `HISTORY_DAYS + 1` sequential
 * NetworkStatsManager queries, and nothing it could find would change the
 * outcome for a network already over its line.
 */
async function checkNetwork(
  network: LimitNetwork,
  limitBytes: number | null,
  warnAtPercent: number,
  cycleStartDay: number,
  now: number,
  alertedKeys: string[]
): Promise<"posted" | "quiet"> {
  const strings = network === "WIFI" ? "alerts.wifi" : "alerts.mobile";
  const { query: cycle, measurement } = cycleRanges(cycleStartDay, now);
  const today = presetRange("today", now);
  const spikeKey = spikeAlertKey(today.start, network);

  // Limit thresholds.
  if (limitBytes) {
    const { totals } = await fetchUsage(cycle, network);
    // The query above has to stop at `now`, but elapsed time and the
    // projection are measured against the whole cycle.
    const status = limitStatus(
      totals.total,
      limitBytes,
      measurement,
      now,
      warnAtPercent
    );

    if (status.state !== "ok") {
      const key = limitAlertKey(
        status.state,
        cycle.start,
        limitBytes,
        warnAtPercent,
        network
      );
      return status.state === "over"
        ? alertOnce(
            key,
            cycle.start,
            spikeKey,
            i18n.t(`${strings}.overTitle`),
            i18n.t(`${strings}.overBody`, {
              used: formatBytes(status.usedBytes),
              limit: formatBytes(status.limitBytes),
            })
          )
        : alertOnce(
            key,
            cycle.start,
            spikeKey,
            i18n.t(`${strings}.warnTitle`, {
              percent: Math.round(status.usedPercent),
            }),
            i18n.t(`${strings}.warnBody`, {
              remaining: formatBytes(status.remainingBytes),
              cycleRemaining: Math.round(100 - status.elapsedPercent),
            })
          );
    }
  }

  // Mobile data is metered whether or not a limit is set, so a spike there is
  // always worth a word. Wi-Fi usually is not: only a configured Wi-Fi limit
  // says this user cares about Wi-Fi volume enough to pay for the scan below.
  if (network === "WIFI" && !limitBytes) return "quiet";

  // Spike detection over the last 14 complete days. Once today's spike alert
  // has fired nothing below can change the outcome, so skip the 15 sequential
  // NetworkStatsManager queries it would take to re-derive it.
  if (alertedKeys.includes(spikeKey)) return "quiet";

  const todayTotal = (await fetchUsage(today, network)).totals.total;

  const history: number[] = [];
  for (let i = 1; i <= HISTORY_DAYS; i++) {
    const dayStart = today.start - i * DAY;
    const { totals } = await fetchUsage(
      { start: dayStart, end: dayStart + DAY, preset: "custom" },
      network
    );
    history.push(totals.total);
  }

  if (detectSpike(history, todayTotal)) {
    return alertOnce(
      spikeKey,
      cycle.start,
      spikeKey,
      i18n.t(`${strings}.spikeTitle`),
      i18n.t(`${strings}.spikeBody`, { bytes: formatBytes(todayTotal) })
    );
  }

  return "quiet";
}

export async function runUsageCheck(now: number) {
  const settings = await loadSettings();
  // Sequentially, not in parallel: both checks read-modify-write `alertedKeys`,
  // and the native queries underneath are serialised anyway.
  const mobile = await checkNetwork(
    "MOBILE",
    settings.mobileLimitBytes,
    settings.mobileWarnAtPercent,
    settings.cycleStartDay,
    now,
    settings.alertedKeys
  );
  const wifi = await checkNetwork(
    "WIFI",
    settings.wifiLimitBytes,
    settings.wifiWarnAtPercent,
    settings.cycleStartDay,
    now,
    settings.alertedKeys
  );
  return mobile === "posted" || wifi === "posted"
    ? ("posted" as const)
    : ("quiet" as const);
}

if (Platform.OS === "android") {
  TaskManager.defineTask(USAGE_CHECK_TASK, async () => {
    try {
      await runUsageCheck(Date.now());
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerBackgroundCheck() {
  // expo-background-task has no meaningful web implementation; registerTaskAsync
  // throws there. A single guard here holds even if a caller forgets Platform.OS.
  if (Platform.OS !== "android") return;

  const registered = await TaskManager.isTaskRegisteredAsync(USAGE_CHECK_TASK);
  if (registered) return;
  // 15 minutes is Android's floor; asking for less does not make it faster.
  await BackgroundTask.registerTaskAsync(USAGE_CHECK_TASK, {
    minimumInterval: 15,
  });
}
