import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import i18n from "@/i18n";
import { fetchUsage } from "@/features/usage/api";
import { formatBytes } from "@/features/usage/format";
import { billingCycleRange, presetRange } from "@/features/usage/range";
import { loadSettings, saveSettings } from "@/features/usage/settings";

import { detectSpike, limitStatus } from "./limits";
import { notify } from "./notify";

export const USAGE_CHECK_TASK = "usage-threshold-check";

const DAY = 86_400_000;
const HISTORY_DAYS = 14;

/**
 * One alert per key per cycle. Without this, a crossed threshold would
 * re-notify every time the background task runs.
 */
async function alertOnce(key: string, title: string, body: string) {
  const settings = await loadSettings();
  if (settings.lastAlert?.key === key) return "quiet" as const;
  await notify(title, body);
  await saveSettings({ lastAlert: { key, at: Date.now() } });
  return "posted" as const;
}

export async function runUsageCheck(now: number) {
  const settings = await loadSettings();
  const cycle = billingCycleRange(settings.cycleStartDay, now);

  // Limit thresholds.
  if (settings.mobileLimitBytes) {
    const { totals } = await fetchUsage(cycle, "MOBILE");
    const status = limitStatus(
      totals.total,
      settings.mobileLimitBytes,
      cycle,
      now,
      settings.warnAtPercent
    );

    // Key includes the cycle start so a new cycle re-arms the alert.
    const cycleKey = `${cycle.start}`;

    if (status.state === "over") {
      return alertOnce(
        `over:${cycleKey}`,
        i18n.t("alerts.overTitle"),
        i18n.t("alerts.overBody", {
          used: formatBytes(status.usedBytes),
          limit: formatBytes(status.limitBytes),
        })
      );
    }
    if (status.state === "warn") {
      return alertOnce(
        `warn:${cycleKey}`,
        i18n.t("alerts.warnTitle", { percent: Math.round(status.usedPercent) }),
        i18n.t("alerts.warnBody", {
          remaining: formatBytes(status.remainingBytes),
          cycleRemaining: Math.round(100 - status.elapsedPercent),
        })
      );
    }
  }

  // Spike detection over the last 14 complete days.
  const today = presetRange("today", now);
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
    const dayKey = new Date(today.start).toISOString().slice(0, 10);
    return alertOnce(
      `spike:${dayKey}`,
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
