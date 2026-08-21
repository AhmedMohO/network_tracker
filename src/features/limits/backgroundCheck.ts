import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { snapshotDay } from "@/features/archive/db";
import { readCache } from "@/features/family/cache";
import { buildDailySeries } from "@/features/family/dailySeries";
import { pullFromParent, syncFromChild, type Snapshot } from "@/features/family/sync";
import { summarizeChildren, type ChildSummary } from "@/features/family/useFamily";
import i18n from "@/i18n";
import { fetchUsage } from "@/features/usage/api";
import { formatBytes } from "@/features/usage/format";
import { formatDateTime, formatDay } from "@/i18n/format";
import { presetRange } from "@/features/usage/range";
import { loadSettings, saveSettings, type Settings } from "@/features/usage/settings";

import {
  decideAlert,
  decideQuietChild,
  decideRequestNotice,
  isStale,
  limitAlertKey,
  spikeAlertKey,
} from "./alerts";
import {
  cycleRanges,
  detectSpike,
  limitStatus,
  type LimitNetwork,
} from "./limits";
import { notify } from "./notify";

export const USAGE_CHECK_TASK = "usage-threshold-check";

/**
 * The same work, reached by a server push instead of by Android's scheduler.
 * Separate task name because `expo-notifications` owns this registration and
 * hands it a notification payload, but the body is deliberately identical —
 * there is one definition of "check usage now" and three ways to trigger it.
 */
export const PUSH_SYNC_TASK = "family-push-sync";

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

/**
 * One child's cycle-to-date total, straight from `buildDailySeries` over the
 * whole cycle: completed `daily` rows plus the newest `recent` heartbeat
 * folded in as the (partial) day its own clock says it covers. Gap-aware —
 * a day the child never pushed contributes nothing rather than a fabricated
 * zero — and the same figure the per-child screen renders from this same
 * cache, so the card and the notification can never disagree.
 *
 * It used to add `recent.totals` on top as "today" unconditionally, which
 * counted a three-day-old heartbeat as today's usage; `buildDailySeries`
 * keying that row by `payload.at` is what removed the need for the
 * special case.
 *
 * `Settings.childLimits[deviceId].mobileLimitBytes` is named for parity with
 * this device's own `mobileLimitBytes`/`wifiLimitBytes` fields, but this
 * compares it against the child's *total* usage (mobile + Wi-Fi). The child
 * does push a real per-network split now, but a day pushed before it did has
 * none, and silently mixing split and unsplit days would misreport the sum as
 * mobile-only — worse than naming the field loosely.
 */
export function childCycleUsedBytes(
  snapshots: Snapshot[],
  cycleStartDay: number,
  now: number
): number {
  const { query } = cycleRanges(cycleStartDay, now);
  return buildDailySeries(snapshots, query.start, now, undefined, now).totals.total;
}

/**
 * One paired child: a limit check (only when configured, and never from data
 * older than 3 hours — see `isStale`'s own doc comment for why), then an
 * independent 24-hour quiet check that applies whether or not a limit is set.
 */
async function checkChild(
  child: ChildSummary,
  snapshots: Snapshot[],
  settings: Settings,
  now: number,
  todaySpikeKey: string
): Promise<{ posted: boolean; quietNotifiedAt?: number; requestNotifiedAt?: number }> {
  let posted = false;
  let requestNotifiedAt: number | undefined;

  const limit = settings.childLimits[child.deviceId];
  if (limit?.mobileLimitBytes && !isStale(child.lastSeen, now)) {
    const usedBytes = childCycleUsedBytes(snapshots, settings.cycleStartDay, now);
    const { query: cycle, measurement } = cycleRanges(settings.cycleStartDay, now);
    const status = limitStatus(
      usedBytes,
      limit.mobileLimitBytes,
      measurement,
      now,
      limit.warnAtPercent
    );

    if (status.state !== "ok") {
      // The child's own clock, quoted, not this device's delivery time — the
      // parent is being told about a fact that is already 15-45 minutes old.
      const newestRecent = snapshots
        .filter((s) => s.kind === "recent")
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const when = formatDateTime(newestRecent?.payload?.at ?? child.lastSeen);

      const key = limitAlertKey(
        status.state,
        cycle.start,
        limit.mobileLimitBytes,
        limit.warnAtPercent,
        "MOBILE",
        child.deviceId
      );
      const result =
        status.state === "over"
          ? await alertOnce(
              key,
              cycle.start,
              todaySpikeKey,
              i18n.t("family.childOverTitle", { label: child.label }),
              i18n.t("family.childOverBody", {
                label: child.label,
                used: formatBytes(status.usedBytes),
                limit: formatBytes(status.limitBytes),
                when,
              })
            )
          : await alertOnce(
              key,
              cycle.start,
              todaySpikeKey,
              i18n.t("family.childWarnTitle", { label: child.label }),
              i18n.t("family.childWarnBody", {
                label: child.label,
                percent: Math.round(status.usedPercent),
                when,
              })
            );
      if (result === "posted") posted = true;
    }
  }

  // A child's outstanding "ask for more data" request, notified once per
  // `request.at` and never for one a `grant` has already answered — the full
  // decision (including the M-7 fix) lives in `decideRequestNotice`
  // (`alerts.ts`), not here, so it stays testable without importing this
  // module (see that function's own doc comment for why). The newest row of
  // each kind wins, matching the "one outstanding request per device" upsert
  // the whole feature relies on.
  const requestRow = snapshots
    .filter((s) => s.kind === "request")
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const grantRow = snapshots
    .filter((s) => s.kind === "grant")
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const askedBytes = requestRow?.payload?.askedBytes;
  const requestAt = requestRow?.payload?.at;
  const requestNotice = decideRequestNotice(
    // `askedBytes: 0` is how a cancelled request is written (`RequestCard`'s
    // `cancelRequest`, review Finding I-3 item a) — not a real ask, so it
    // must not notify the parent about one the child has already abandoned.
    typeof askedBytes === "number" && askedBytes > 0 && typeof requestAt === "number"
      ? { askedBytes, at: requestAt }
      : null,
    typeof grantRow?.payload?.requestAt === "number"
      ? { requestAt: grantRow.payload.requestAt }
      : null,
    settings.childRequestNotifiedAt[child.deviceId]
  );
  if (requestNotice.fire) {
    await notify(
      i18n.t("family.childRequestTitle", { label: child.label }),
      i18n.t("family.childRequestBody", {
        label: child.label,
        bytes: formatBytes(requestNotice.askedBytes),
      })
    );
    posted = true;
    requestNotifiedAt = requestNotice.notifiedAt;
  }

  // Independent of any limit: an honest observation ("no check-in since
  // yesterday"), not an accusation, and it never fires on the ordinary
  // overnight Doze gap because the threshold is a full 24 hours.
  if (
    child.lastSeen > 0 &&
    decideQuietChild(child.lastSeen, now, settings.childQuietNotifiedAt[child.deviceId])
  ) {
    await notify(
      i18n.t("family.childQuietTitle", { label: child.label }),
      i18n.t("family.childQuietBody", {
        label: child.label,
        when: formatDateTime(child.lastSeen),
      })
    );
    posted = true;
    return { posted, quietNotifiedAt: child.lastSeen, requestNotifiedAt };
  }

  return { posted, requestNotifiedAt };
}

/**
 * Every paired child, read from the cache `pullFromParent` (above, in
 * `runUsageCheck`) has just refreshed. Makes no network call of its own —
 * this only reads the local cache — but still guarded on `parent` + paired
 * so a non-parent install (which will have no cache to read anyway) does no
 * work here either.
 */
async function checkChildren(now: number, todaySpikeKey: string): Promise<"posted" | "quiet"> {
  const settings = await loadSettings();
  if (settings.familyRole !== "parent" || !settings.pairToken) return "quiet";

  const cached = await readCache();
  if (cached.length === 0) return "quiet";

  const children = summarizeChildren(cached);
  let posted = false;
  let quietPatch: Record<string, number> | null = null;
  let requestPatch: Record<string, number> | null = null;

  for (const child of children) {
    const snapshots = cached.filter((r) => r.deviceId === child.deviceId);
    const result = await checkChild(child, snapshots, settings, now, todaySpikeKey);
    if (result.posted) posted = true;
    if (result.quietNotifiedAt !== undefined) {
      quietPatch = { ...(quietPatch ?? settings.childQuietNotifiedAt), [child.deviceId]: result.quietNotifiedAt };
    }
    if (result.requestNotifiedAt !== undefined) {
      requestPatch = {
        ...(requestPatch ?? settings.childRequestNotifiedAt),
        [child.deviceId]: result.requestNotifiedAt,
      };
    }
  }

  if (quietPatch) {
    await saveSettings({ childQuietNotifiedAt: quietPatch });
  }
  if (requestPatch) {
    await saveSettings({ childRequestNotifiedAt: requestPatch });
  }

  return posted ? "posted" : "quiet";
}

export async function runUsageCheck(now: number) {
  const settings = await loadSettings();
  // Sequentially, not in parallel: both checks read-modify-write `alertedKeys`,
  // and the native queries underneath are serialised anyway.
  //
  // Each wrapped in its own try/catch, same swallow-and-continue posture as
  // `snapshotDay`/`syncFromChild`/`pullFromParent` below: `checkNetwork` calls
  // `fetchUsage`, which rejects when Usage Access is not granted on *this*
  // device. A parent who paired only to watch a child may never have granted
  // it themselves — that must not cost the child pull and its alerts, which
  // are this run's whole point.
  let mobile: "posted" | "quiet" = "quiet";
  try {
    mobile = await checkNetwork(
      "MOBILE",
      settings.mobileLimitBytes,
      settings.mobileWarnAtPercent,
      settings.cycleStartDay,
      now,
      settings.alertedKeys
    );
  } catch {
    // Nothing to tell the user: this device's own mobile check failed, but
    // the child pull below must still run.
  }
  let wifi: "posted" | "quiet" = "quiet";
  try {
    wifi = await checkNetwork(
      "WIFI",
      settings.wifiLimitBytes,
      settings.wifiWarnAtPercent,
      settings.cycleStartDay,
      now,
      settings.alertedKeys
    );
  } catch {
    // See above.
  }
  // Yesterday, not today: a complete day is the only one worth storing, and
  // `INSERT OR REPLACE` makes a repeated run harmless. A failure here must not
  // cost the alerts their result — the day is re-snapshotted on the next run.
  try {
    await snapshotDay(presetRange("yesterday", now).start);
  } catch {
    // Nothing to tell the user: the archive only matters months from now.
  }

  // Best-effort, same posture as snapshotDay above: sync must never cost this
  // run its alerts or its archive write. Offline, or the project is paused —
  // either way the next run re-pushes, since the RPC upserts. `syncFromChild`
  // (via `rpc`) has already stamped `lastSyncErrorAt`; the check below is what
  // stops that stamp from being a secret.
  try {
    // The device-context probe lives inside `syncFromChild` now, behind its
    // own try and after the child-role guard — so a probe failure costs this
    // push nothing, every push path carries the same context, and a parent or
    // unpaired device never runs it at all.
    await syncFromChild(now);
  } catch (e) {
    console.warn('[family] background syncFromChild failed:', e);
  }

  // Same posture again, mirrored for the parent side: a failed pull must
  // never cost this run its own alerts or archive write either. `pullFromParent`
  // is itself a no-op (and makes no network call) unless this device is a
  // paired parent.
  try {
    await pullFromParent(now);
  } catch (e) {
    console.warn('[family] background pullFromParent failed:', e);
  }

  // Reuses the same "today" spike-day string `checkNetwork` computes for
  // mobile above — `decideAlert` only ever reads its date portion (field 2 of
  // `k.split(":")`), which is identical regardless of which network's key
  // produced it, so there is no real per-network spike concept to derive for
  // a child here.
  // Same swallow-and-continue posture as every other step in this run: a
  // failure here must not cost the sync-broken check below its turn.
  let children: "posted" | "quiet" = "quiet";
  try {
    children = await checkChildren(
      now,
      spikeAlertKey(presetRange("today", now).start, "MOBILE")
    );
  } catch {
    // See above.
  }

  // `decideAlert`'s pruning is keyed to a limit/spike alert's own network and
  // cycle, so a "sync is broken" key does not fit `alertOnce` — every call
  // would fail the network-prefix check and re-fire on the next 15-minute
  // run. `syncErrorNotifiedAt` is a dedicated one-shot instead: it records
  // *which* failure run was already reported, so a recovery (which clears
  // `lastSyncErrorAt`) and a later re-failure naturally get a new value and
  // notify again.
  const { lastSyncErrorAt, syncErrorNotifiedAt, pairToken } = await loadSettings();
  // `unpair()` clears `lastSyncErrorAt` along with `pairToken`, so this guard
  // is normally redundant — it stays as the explicit guarantee that a
  // now-unpaired device (no family left to sync with) can never post "Family
  // sharing has stopped" even if the two writes ever raced.
  if (
    pairToken &&
    lastSyncErrorAt &&
    now - lastSyncErrorAt > 2 * DAY &&
    syncErrorNotifiedAt !== lastSyncErrorAt
  ) {
    await notify(
      i18n.t("family.syncBrokenTitle"),
      i18n.t("family.syncBrokenBody", { date: formatDay(lastSyncErrorAt) })
    );
    await saveSettings({ syncErrorNotifiedAt: lastSyncErrorAt });
  }

  return mobile === "posted" || wifi === "posted" || children === "posted"
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

  // Woken by `family_ping_stale`'s data-only push. The payload is not read:
  // it carries no instructions, it is only a knock on the door, and treating
  // it as data would make a spoofed push able to steer this device.
  TaskManager.defineTask(PUSH_SYNC_TASK, async () => {
    try {
      await runUsageCheck(Date.now());
    } catch (e) {
      console.warn("[family] push-triggered check failed:", e);
    }
  });
}

export async function registerBackgroundCheck() {
  // expo-background-task has no meaningful web implementation; registerTaskAsync
  // throws there. A single guard here holds even if a caller forgets Platform.OS.
  if (Platform.OS !== "android") return;

  // Before the early return below: this one has to be re-asserted on every
  // launch, and gating it on the *other* task's registration would mean a
  // device that registered before this feature existed never picks it up.
  // Idempotent — re-registering the same task name replaces the handler.
  try {
    await Notifications.registerTaskAsync(PUSH_SYNC_TASK);
  } catch (e) {
    console.warn("[family] push task registration failed:", e);
  }

  const registered = await TaskManager.isTaskRegisteredAsync(USAGE_CHECK_TASK);
  if (registered) return;
  // 15 minutes is the floor Android accepts, and it remains a request rather
  // than a promise — `SyncKeepAlive` (native) and the push path above are what
  // make it happen on time. This stays as the fallback for a device with
  // neither: it costs nothing when the others work, since every path runs the
  // same idempotent check.
  await BackgroundTask.registerTaskAsync(USAGE_CHECK_TASK, {
    minimumInterval: 15,
  });
}
