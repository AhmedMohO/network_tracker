import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import i18n from "@/i18n";
import { fetchUsage } from "@/features/usage/api";
import { formatBytes } from "@/features/usage/format";
import {
  billingCycleRange,
  nextCycleStart,
  presetRange,
} from "@/features/usage/range";
import { loadSettings, saveSettings } from "@/features/usage/settings";

import { decideAlert, limitAlertKey, spikeAlertKey } from "./alerts";
import { detectSpike, limitStatus } from "./limits";
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
  if (!decision.fire) return "quiet" as const;
  await notify(title, body);
  await saveSettings({ alertedKeys: decision.alertedKeys });
  return "posted" as const;
}

export async function runUsageCheck(now: number) {
  const settings = await loadSettings();
  const cycle = billingCycleRange(settings.cycleStartDay, now);
  const today = presetRange("today", now);
  const spikeKey = spikeAlertKey(today.start);

  // Limit thresholds.
  const limitBytes = settings.mobileLimitBytes;
  if (limitBytes) {
    const { totals } = await fetchUsage(cycle, "MOBILE");
    const status = limitStatus(
      totals.total,
      limitBytes,
      // The query above has to stop at `now`, but elapsed time and the
      // projection are measured against the whole cycle.
      { ...cycle, end: nextCycleStart(settings.cycleStartDay, now) },
      now,
      settings.warnAtPercent
    );

    if (status.state !== "ok") {
      const key = limitAlertKey(
        status.state,
        cycle.start,
        limitBytes,
        settings.warnAtPercent
      );
      return status.state === "over"
        ? alertOnce(
            key,
            cycle.start,
            spikeKey,
            i18n.t("alerts.overTitle"),
            i18n.t("alerts.overBody", {
              used: formatBytes(status.usedBytes),
              limit: formatBytes(status.limitBytes),
            })
          )
        : alertOnce(
            key,
            cycle.start,
            spikeKey,
            i18n.t("alerts.warnTitle", {
              percent: Math.round(status.usedPercent),
            }),
            i18n.t("alerts.warnBody", {
              remaining: formatBytes(status.remainingBytes),
              cycleRemaining: Math.round(100 - status.elapsedPercent),
            })
          );
    }
  }

  // Spike detection over the last 14 complete days. Once today's spike alert
  // has fired nothing below can change the outcome, so skip the 15 sequential
  // NetworkStatsManager queries it would take to re-derive it.
  if (settings.alertedKeys.includes(spikeKey)) return "quiet" as const;

  const todayTotal = (await fetchUsage(today, "MOBILE")).totals.total;

  const history: number[] = [];
  for (let i = 1; i <= HISTORY_DAYS; i++) {
    const dayStart = today.start - i * DAY;
    const { totals } = await fetchUsage(
      { start: dayStart, end: dayStart + DAY, preset: "custom" },
      "MOBILE"
    );
    history.push(totals.total);
  }

  if (detectSpike(history, todayTotal)) {
    return alertOnce(
      spikeKey,
      cycle.start,
      spikeKey,
      i18n.t("alerts.spikeTitle"),
      i18n.t("alerts.spikeBody", { bytes: formatBytes(todayTotal) })
    );
  }

  return "quiet" as const;
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
