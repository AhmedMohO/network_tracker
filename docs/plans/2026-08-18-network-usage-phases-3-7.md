# Network Usage Tracker — Phases 3–7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Continues from:** [`2026-08-18-network-usage-foundation.md`](./2026-08-18-network-usage-foundation.md) (Tasks 1–11). Task numbering continues at 12.

**Goal:** Take the working dashboard from Phase 2 through data limits, period comparison, live monitoring, export, store-free updates, and long-term retention — to a shippable v1.

**Architecture:** Unchanged. Kotlin stays a thin reader; all logic that can be a pure TypeScript function is one, and is tested. Background work uses `expo-background-task` (WorkManager under the hood) — **no foreground service anywhere in this plan.**

**Tech Stack additions:** `expo-notifications`, `expo-background-task`, `expo-task-manager`, `expo-sharing`, `expo-file-system`, `expo-updates`, `expo-application`.

---

## Global Constraints

All constraints from the foundation plan still apply. Additionally:

- **No foreground service.** If a feature seems to need one, it is out of scope until proven otherwise. Live means live *while the user is looking at the screen*.
- **Background work uses `expo-background-task`** with a minimum interval of 15 minutes — Android's floor. Never promise the user a check more frequent than that.
- **Every new dependency is an Expo-managed package** installed with `npx expo install`, so it stays version-matched to SDK 57.
- **Notifications require a channel on Android 8+ and runtime permission on Android 13+.** Both must be handled before the first notification is posted.
- **Nothing leaves the device** except: the update check (GitHub API), the OTA update check (EAS), and files the user explicitly shares. Never send usage data anywhere.
- **Test on a physical device** for every task with a background, notification, or install component. None of these behave correctly on an emulator.

---

## Phase 0 assumptions baked into this plan

These phases were gated on `docs/findings/phase-0.md`. Written here against the **expected** findings; each branch point below names the task to change if your findings differ.

| Assumption | If your findings say otherwise |
|---|---|
| System buckets are ~1 hour wide; sub-hour ranges snap outward | No change needed — `coverageNote` already reports the truth either way |
| Bulk `querySummary` returns `STATE_ALL` only, so foreground/background needs a per-UID query | **Task 12b** adds `appStateUsage`. If your dump *did* show `STATE_FOREGROUND` rows, skip Task 12b — Phase 2 already has the split |
| Per-app live monitoring is **NO-GO** | If GO: build **Task 20** as well as Task 19, and keep the per-app live list |
| Android retains ~90 days of per-UID detail | If your device retains noticeably less, move Phase 7 ahead of Phase 6 |

Before starting, open `docs/findings/phase-0.md` and confirm each row. If a row disagrees, follow the right-hand column.

---

# Phase 3 — Limits, projection and alerts

---

### Task 12: Limit, projection and spike math

Pure functions, tested. No UI, no notifications, no native code — this task is the arithmetic that the next two tasks render and act on.

**Files:**
- Create: `src/features/limits/limits.ts`
- Create: `src/features/limits/limits.test.ts`

**Interfaces:**
- Consumes: `Range` from `@/features/usage/range`
- Produces:
  - `type LimitState = "ok" | "warn" | "over"`
  - `type LimitStatus = { usedBytes: number; limitBytes: number; remainingBytes: number; usedPercent: number; elapsedPercent: number; projectedBytes: number; state: LimitState }`
  - `limitStatus(usedBytes, limitBytes, range, now, warnAtPercent): LimitStatus`
  - `median(values: number[]): number`
  - `detectSpike(previousDailyTotals: number[], todayTotal: number, factor?: number): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/features/limits/limits.test.ts`:

```ts
import type { Range } from "@/features/usage/range";
import { detectSpike, limitStatus, median } from "./limits";

const GB = 1024 ** 3;
// A 10-day cycle, so "halfway" is easy to reason about.
const range: Range = { start: 0, end: 10 * 86_400_000, label: "cycle" };
const halfway = 5 * 86_400_000;

describe("limitStatus", () => {
  it("reports remaining bytes and percent used", () => {
    const s = limitStatus(6 * GB, 10 * GB, range, halfway, 80);
    expect(s.remainingBytes).toBe(4 * GB);
    expect(s.usedPercent).toBeCloseTo(60);
  });

  it("projects the cycle total from the elapsed fraction", () => {
    // 6 GB used at the halfway point projects to 12 GB.
    const s = limitStatus(6 * GB, 10 * GB, range, halfway, 80);
    expect(s.elapsedPercent).toBeCloseTo(50);
    expect(s.projectedBytes).toBeCloseTo(12 * GB);
  });

  it("is ok below the warning threshold", () => {
    expect(limitStatus(1 * GB, 10 * GB, range, halfway, 80).state).toBe("ok");
  });

  it("warns at the configured percentage", () => {
    expect(limitStatus(8 * GB, 10 * GB, range, halfway, 80).state).toBe("warn");
  });

  it("reports over once the limit is passed", () => {
    expect(limitStatus(11 * GB, 10 * GB, range, halfway, 80).state).toBe("over");
  });

  it("never reports negative remaining", () => {
    expect(limitStatus(15 * GB, 10 * GB, range, halfway, 80).remainingBytes).toBe(0);
  });

  it("does not divide by zero at the very start of a cycle", () => {
    const s = limitStatus(0, 10 * GB, range, range.start, 80);
    expect(Number.isFinite(s.projectedBytes)).toBe(true);
    expect(s.projectedBytes).toBe(0);
  });

  it("does not project beyond the end of the cycle", () => {
    const s = limitStatus(9 * GB, 10 * GB, range, range.end, 80);
    expect(s.projectedBytes).toBeCloseTo(9 * GB);
  });
});

describe("median", () => {
  it("returns the middle value of an odd-length list", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("averages the middle pair of an even-length list", () => {
    expect(median([1, 3, 5, 7])).toBe(4);
  });

  it("returns zero for an empty list", () => {
    expect(median([])).toBe(0);
  });
});

describe("detectSpike", () => {
  const normal = [100, 110, 90, 105, 95, 100, 100];

  it("flags a day far above the recent median", () => {
    expect(detectSpike(normal, 400)).toBe(true);
  });

  it("ignores a normal day", () => {
    expect(detectSpike(normal, 130)).toBe(false);
  });

  it("uses the median so one huge day does not raise the bar", () => {
    const withOutlier = [100, 110, 5000, 105, 95, 100, 100];
    expect(detectSpike(withOutlier, 400)).toBe(true);
  });

  it("does not flag anything without enough history", () => {
    expect(detectSpike([100, 200], 5000)).toBe(false);
  });

  it("does not flag a spike from a zero baseline", () => {
    expect(detectSpike([0, 0, 0, 0, 0, 0, 0], 50 * 1024 * 1024)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/features/limits/limits.test.ts`
Expected: FAIL — `Cannot find module './limits'`

- [ ] **Step 3: Implement**

Create `src/features/limits/limits.ts`:

```ts
import type { Range } from "@/features/usage/range";

export type LimitState = "ok" | "warn" | "over";

export type LimitStatus = {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  usedPercent: number;
  elapsedPercent: number;
  projectedBytes: number;
  state: LimitState;
};

const MIN_HISTORY_DAYS = 5;

export function limitStatus(
  usedBytes: number,
  limitBytes: number,
  range: Range,
  now: number,
  warnAtPercent: number
): LimitStatus {
  const span = Math.max(1, range.end - range.start);
  const elapsed = Math.min(Math.max(0, now - range.start), span);
  const elapsedFraction = elapsed / span;

  // Straight-line projection: at this rate, where does the cycle end up?
  // With no elapsed time there is no rate to extrapolate from, so project
  // what has actually been used rather than dividing by zero.
  const projectedBytes =
    elapsedFraction === 0 ? usedBytes : usedBytes / elapsedFraction;

  const usedPercent = limitBytes === 0 ? 0 : (usedBytes / limitBytes) * 100;

  const state: LimitState =
    usedBytes >= limitBytes
      ? "over"
      : usedPercent >= warnAtPercent
        ? "warn"
        : "ok";

  return {
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    usedPercent,
    elapsedPercent: elapsedFraction * 100,
    projectedBytes,
    state,
  };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * A spike is today being far above the *median* of recent days. Median, not
 * mean: one 5 GB day should not raise the bar for the next fortnight.
 */
export function detectSpike(
  previousDailyTotals: number[],
  todayTotal: number,
  factor = 3
): boolean {
  if (previousDailyTotals.length < MIN_HISTORY_DAYS) return false;
  const baseline = median(previousDailyTotals);
  // A zero baseline makes every non-zero day an infinite ratio; that is not
  // a spike, it is a first day of use.
  if (baseline <= 0) return false;
  return todayTotal / baseline >= factor;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/features/limits/limits.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: limit status, usage projection and spike detection"
```

---

### Task 12b: Per-UID foreground/background split

**Skip this task entirely if Phase 0 Q2 recorded `STATE_FOREGROUND` rows in the bulk dump** — Phase 2 already has the split and this adds nothing.

**Files:**
- Modify: `modules/network-usage/android/src/main/java/expo/modules/networkusage/StatsReader.kt`
- Modify: `.../Records.kt`, `.../NetworkUsageModule.kt`
- Modify: `modules/network-usage/src/NetworkUsage.types.ts`, `index.ts`
- Modify: `src/features/usage/api.ts`
- Modify: `src/app/usage/[uid].tsx`

**Interfaces:**
- Produces:
  - `NetworkUsage.getAppStateUsage(q: AppStateQuery): Promise<{ foregroundBytes: number; backgroundBytes: number }>`
  - `type AppStateQuery = { start: number; end: number; network: NetworkFilter; uid: number }`

- [ ] **Step 1: Add the record**

In `Records.kt`:

```kotlin
class AppStateQuery : Record {
    @Field val start: Long = 0
    @Field val end: Long = 0
    @Field val network: String = "ALL"
    @Field val uid: Int = 0
}
```

- [ ] **Step 2: Add the reader**

In `StatsReader.kt`. `queryDetailsForUidTag` does not filter by state, so use `queryDetailsForUidTagState`, which does — one call per state.

```kotlin
    @Suppress("DEPRECATION")
    fun appStateUsage(q: AppStateQuery): Map<String, Any?> {
        var foreground = 0L
        var total = 0L

        for (type in networkTypes(q.network)) {
            for (state in intArrayOf(
                NetworkStats.Bucket.STATE_ALL,
                NetworkStats.Bucket.STATE_FOREGROUND
            )) {
                val stats = try {
                    nsm.queryDetailsForUidTagState(
                        type, null, q.start, q.end, q.uid,
                        NetworkStats.Bucket.TAG_NONE, state
                    )
                } catch (e: SecurityException) {
                    throw UsageAccessDeniedException()
                }

                stats.use { s ->
                    val b = NetworkStats.Bucket()
                    var sum = 0L
                    while (s.hasNextBucket()) {
                        s.getNextBucket(b)
                        sum += b.rxBytes + b.txBytes
                    }
                    if (state == NetworkStats.Bucket.STATE_FOREGROUND) {
                        foreground += sum
                    } else {
                        total += sum
                    }
                }
            }
        }

        return mapOf(
            "foregroundBytes" to foreground,
            // STATE_ALL already includes foreground, so background is the remainder.
            "backgroundBytes" to (total - foreground).coerceAtLeast(0L)
        )
    }
```

- [ ] **Step 3: Expose and type it**

```kotlin
        AsyncFunction("getAppStateUsage") { q: AppStateQuery ->
            StatsReader(context).appStateUsage(q)
        }
```

Add `AppStateQuery` to `NetworkUsage.types.ts` and `getAppStateUsage(q: AppStateQuery): Promise<{ foregroundBytes: number; backgroundBytes: number }>` to the class declaration in `index.ts`. Add a `fetchAppStateUsage` wrapper in `src/features/usage/api.ts`.

- [ ] **Step 4: Use it on the detail screen**

In `src/app/usage/[uid].tsx`, replace the `AppUsage.foreground`/`background` values with a `useEffect` that calls `fetchAppStateUsage({ start, end, network, uid })` and renders the result. Show a dash while it loads rather than a misleading zero.

- [ ] **Step 5: Verify on the device**

Expected: for an app you have been actively using, foreground is a large share; for a sync-heavy app you have not opened today, background dominates. `foreground + background` must equal the total shown at the top of the same screen — if it does not, `STATE_ALL` is not the superset you assumed, and the finding needs re-recording before continuing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(native): per-app foreground/background split via state query"
```

---

### Task 13: Limits screen

**Files:**
- Create: `src/app/limits.tsx`
- Create: `src/features/limits/LimitCard.tsx`
- Modify: `src/features/usage/settings.ts`
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: `limitStatus`, `billingCycleRange`, `useUsage`, `formatBytes`, `loadSettings`/`saveSettings`
- Produces: `<LimitCard status projectedNote />`

- [ ] **Step 1: Verify the settings shape covers this**

`Settings` from Task 8 already holds `cycleStartDay`, `mobileLimitBytes`, `warnAtPercent`, `showSystemApps`. No change needed — confirm by reading `src/features/usage/settings.ts` before writing the screen.

- [ ] **Step 2: Write `LimitCard.tsx`**

```tsx
import { Text, View } from "react-native";
import { formatBytes } from "@/features/usage/format";
import type { LimitStatus } from "./limits";

const COLORS: Record<LimitStatus["state"], string> = {
  ok: "#208AEF",
  warn: "#E8A200",
  over: "#D33",
};

export function LimitCard({ status }: { status: LimitStatus }) {
  const color = COLORS[status.state];
  const overProjection = status.projectedBytes > status.limitBytes;

  return (
    <View style={{ gap: 8, paddingVertical: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 24, fontWeight: "700" }}>
          {formatBytes(status.usedBytes)}
        </Text>
        <Text style={{ opacity: 0.6 }}>of {formatBytes(status.limitBytes)}</Text>
      </View>

      {/* Two bars: usage against the limit, and a marker for how far through
          the cycle we are. Being at 60% of the data on day 3 of 30 is the
          thing worth seeing, and one number cannot show it. */}
      <View style={{ height: 8, backgroundColor: "#0001", borderRadius: 4 }}>
        <View
          style={{
            width: `${Math.min(100, status.usedPercent)}%`,
            height: 8,
            backgroundColor: color,
            borderRadius: 4,
          }}
        />
      </View>
      <View style={{ height: 2, backgroundColor: "#0001" }}>
        <View
          style={{
            width: `${Math.min(100, status.elapsedPercent)}%`,
            height: 2,
            backgroundColor: "#0006",
          }}
        />
      </View>
      <Text style={{ fontSize: 12, opacity: 0.6 }}>
        {Math.round(status.elapsedPercent)}% through the cycle
      </Text>

      <Text style={{ color }}>
        {status.state === "over"
          ? `Over by ${formatBytes(status.usedBytes - status.limitBytes)}`
          : `${formatBytes(status.remainingBytes)} left`}
      </Text>

      <Text style={{ opacity: 0.7 }}>
        {overProjection
          ? `At this rate you will use ${formatBytes(status.projectedBytes)} — over your limit.`
          : `At this rate you will use ${formatBytes(status.projectedBytes)} this cycle.`}
      </Text>
    </View>
  );
}
```

- [ ] **Step 3: Write the limits screen**

`src/app/limits.tsx` — the cycle usage plus the three editable settings.

```tsx
import { useEffect, useMemo, useState } from "react";
import { Button, Switch, Text, TextInput, View } from "react-native";
import { LimitCard } from "@/features/limits/LimitCard";
import { limitStatus } from "@/features/limits/limits";
import { billingCycleRange } from "@/features/usage/range";
import { saveSettings } from "@/features/usage/settings";
import { useUsage } from "@/features/usage/useUsage";
import { useUsageContext } from "@/features/usage/useUsageContext";

const GB = 1024 ** 3;

export default function Limits() {
  const { settings, reloadSettings } = useUsageContext();
  const [limitGb, setLimitGb] = useState("");
  const [warnPercent, setWarnPercent] = useState("80");
  const [cycleDay, setCycleDay] = useState("1");

  useEffect(() => {
    if (!settings) return;
    setLimitGb(
      settings.mobileLimitBytes ? String(settings.mobileLimitBytes / GB) : ""
    );
    setWarnPercent(String(settings.warnAtPercent));
    setCycleDay(String(settings.cycleStartDay));
  }, [settings]);

  // The limit always applies to mobile data over the billing cycle,
  // regardless of the filter the user has set elsewhere.
  const cycle = useMemo(
    () => billingCycleRange(settings?.cycleStartDay ?? 1, Date.now()),
    [settings?.cycleStartDay]
  );
  const { data } = useUsage(cycle, "MOBILE");

  const status =
    data && settings?.mobileLimitBytes
      ? limitStatus(
          data.totals.total,
          settings.mobileLimitBytes,
          cycle,
          Date.now(),
          settings.warnAtPercent
        )
      : null;

  const save = async () => {
    const gb = Number(limitGb);
    const warn = Number(warnPercent);
    const day = Number(cycleDay);
    await saveSettings({
      mobileLimitBytes: Number.isFinite(gb) && gb > 0 ? gb * GB : null,
      warnAtPercent:
        Number.isFinite(warn) && warn > 0 && warn <= 100 ? warn : 80,
      cycleStartDay:
        Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1,
    });
    reloadSettings();
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      {status ? (
        <LimitCard status={status} />
      ) : (
        <Text style={{ opacity: 0.6 }}>Set a mobile data limit to track it.</Text>
      )}

      <View style={{ gap: 8 }}>
        <Text>Monthly mobile limit (GB)</Text>
        <TextInput
          value={limitGb}
          onChangeText={setLimitGb}
          keyboardType="numeric"
          placeholder="e.g. 10"
          style={{ borderWidth: 1, borderColor: "#0002", borderRadius: 8, padding: 10 }}
        />

        <Text>Warn me at (%)</Text>
        <TextInput
          value={warnPercent}
          onChangeText={setWarnPercent}
          keyboardType="numeric"
          style={{ borderWidth: 1, borderColor: "#0002", borderRadius: 8, padding: 10 }}
        />

        <Text>Billing cycle starts on day</Text>
        <TextInput
          value={cycleDay}
          onChangeText={setCycleDay}
          keyboardType="numeric"
          style={{ borderWidth: 1, borderColor: "#0002", borderRadius: 8, padding: 10 }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Switch
            value={settings?.showSystemApps ?? false}
            onValueChange={async (v) => {
              await saveSettings({ showSystemApps: v });
              reloadSettings();
            }}
          />
          <Text>Show system apps</Text>
        </View>

        <Button title="Save" onPress={save} />
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Surface it on the dashboard**

When `settings.mobileLimitBytes` is set and the network filter is `MOBILE`, render a compact `<LimitCard>` above the totals on `src/app/index.tsx`, using the same `billingCycleRange` query. Add a route to `/limits` from the header.

- [ ] **Step 5: Verify on the device**

Expected: set a limit of 10 GB with a cycle day matching your real plan; the used figure matches your carrier's app within a few percent. Change the cycle day to today's date and the used figure drops to today's usage only. An empty limit field saves as "no limit" and the card disappears rather than showing `NaN`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: data limit screen with projection and cycle settings"
```

---

### Task 14: Background threshold checks and notifications

**Files:**
- Modify: `package.json`, `app.json`
- Create: `src/features/limits/notify.ts`
- Create: `src/features/limits/backgroundCheck.ts`
- Modify: `src/app/_layout.tsx`
- Modify: `src/features/usage/settings.ts`

**Interfaces:**
- Consumes: `limitStatus`, `detectSpike`, `fetchUsage`, `billingCycleRange`, `presetRange`
- Produces:
  - `ensureNotificationSetup(): Promise<boolean>`
  - `notify(title: string, body: string): Promise<void>`
  - `registerBackgroundCheck(): Promise<void>`
  - `runUsageCheck(now: number): Promise<"posted" | "quiet">`
  - Settings gain `lastAlert: { key: string; at: number } | null`

- [ ] **Step 1: Install the packages**

```bash
npx expo install expo-notifications expo-background-task expo-task-manager
```

In `app.json`, add `"expo-notifications"` to `plugins`. Rebuild the dev client after this step (`npx expo run:android`) — new native modules are not picked up by a JS reload.

- [ ] **Step 2: Write `notify.ts`**

```ts
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "usage-alerts";

export async function ensureNotificationSetup(): Promise<boolean> {
  if (Platform.OS === "android") {
    // Required on Android 8+; without it notifications are silently dropped.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Usage alerts",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  // Runtime permission is required on Android 13+; a no-op below that.
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function notify(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null, // deliver immediately
    ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
  });
}
```

- [ ] **Step 3: Extend the settings type**

In `src/features/usage/settings.ts`, add to `Settings` and `DEFAULTS`:

```ts
  lastAlert: { key: string; at: number } | null;
```

with a default of `null`. This is what stops the same alert firing every fifteen minutes for the rest of the cycle.

- [ ] **Step 4: Write `backgroundCheck.ts`**

```ts
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { fetchUsage } from "@/features/usage/api";
import { billingCycleRange, presetRange } from "@/features/usage/range";
import { loadSettings, saveSettings } from "@/features/usage/settings";
import { detectSpike, limitStatus } from "./limits";
import { formatBytes } from "@/features/usage/format";
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
        "Mobile data limit reached",
        `You have used ${formatBytes(status.usedBytes)} of ${formatBytes(status.limitBytes)}.`
      );
    }
    if (status.state === "warn") {
      return alertOnce(
        `warn:${cycleKey}`,
        `${Math.round(status.usedPercent)}% of your data used`,
        `${formatBytes(status.remainingBytes)} left, with ${Math.round(100 - status.elapsedPercent)}% of the cycle to go.`
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
      { start: dayStart, end: dayStart + DAY, label: "day" },
      "MOBILE"
    );
    history.push(totals.total);
  }

  if (detectSpike(history, todayTotal)) {
    const dayKey = new Date(today.start).toISOString().slice(0, 10);
    return alertOnce(
      `spike:${dayKey}`,
      "Unusual mobile data usage",
      `${formatBytes(todayTotal)} today, well above your recent average.`
    );
  }

  return "quiet" as const;
}

TaskManager.defineTask(USAGE_CHECK_TASK, async () => {
  try {
    await runUsageCheck(Date.now());
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundCheck() {
  const registered = await TaskManager.isTaskRegisteredAsync(USAGE_CHECK_TASK);
  if (registered) return;
  // 15 minutes is Android's floor; asking for less does not make it faster.
  await BackgroundTask.registerTaskAsync(USAGE_CHECK_TASK, {
    minimumInterval: 15,
  });
}
```

- [ ] **Step 5: Register on startup**

In `src/app/_layout.tsx`, import `backgroundCheck` at module scope so `defineTask` runs during app load, then in an effect:

```tsx
useEffect(() => {
  ensureNotificationSetup().then((granted) => {
    if (granted) registerBackgroundCheck();
  });
}, []);
```

The fifteen day-queries in `runUsageCheck` each hit `NetworkStatsManager`; if the background task times out on your device, reduce `HISTORY_DAYS` to 7 and record the change.

- [ ] **Step 6: Verify on the device**

Do not wait fifteen minutes to find out whether the logic works. Test the two halves separately:

1. **Logic:** add a temporary dev button calling `runUsageCheck(Date.now())` and check the return value and the notification. Set your limit to a value just below current usage to force `over`, then to a high value to force `ok`.
2. **Scheduling:** with the app backgrounded, trigger the task manually:
   ```bash
   adb shell cmd jobscheduler run -f <your.package.name> 0
   ```
   Expected: the notification arrives with the app in the background.

Then confirm the once-per-cycle rule: run the check twice in a row and verify the second returns `"quiet"` with no second notification.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: background threshold checks with limit and spike notifications"
```

---

# Phase 4 — Comparison

---

### Task 15: Previous-period math

**Files:**
- Modify: `src/features/usage/range.ts`
- Modify: `src/features/usage/range.test.ts`

**Interfaces:**
- Produces: `previousRange(range: Range, cycleStartDay: number, now: number): Range`

- [ ] **Step 1: Write the failing test**

Append to `src/features/usage/range.test.ts`:

```ts
import { previousRange } from "./range";

describe("previousRange", () => {
  it("shifts a fixed range back by its own length", () => {
    const r = { start: 1_000_000, end: 1_500_000, label: "Custom" };
    const prev = previousRange(r, 1, NOW);
    expect(prev.end).toBe(r.start);
    expect(prev.end - prev.start).toBe(r.end - r.start);
  });

  it("returns the previous calendar cycle for a cycle range", () => {
    const cycle = presetRange("thisCycle", NOW, 11);
    const prev = previousRange(cycle, 11, NOW);
    expect(new Date(prev.start).getMonth()).toBe(6); // July 11
    expect(new Date(prev.end).getDate()).toBe(11);
  });

  it("compares like with like for a partial cycle", () => {
    // Nine days into the cycle: the previous period must also be nine days,
    // not a whole month, or the comparison is meaningless.
    const cycle = presetRange("thisCycle", NOW, 11);
    const prev = previousRange(cycle, 11, NOW);
    const elapsed = NOW - cycle.start;
    expect(prev.end - prev.start).toBeLessThanOrEqual(
      elapsed + 2 * 86_400_000
    );
  });

  it("labels the result so the UI does not have to guess", () => {
    const r = presetRange("last7d", NOW);
    expect(previousRange(r, 1, NOW).label).toBe("Previous 7 days");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/features/usage/range.test.ts -t previousRange`
Expected: FAIL — `previousRange is not a function`

- [ ] **Step 3: Implement**

Append to `src/features/usage/range.ts`:

```ts
/**
 * The period immediately before `range`, for like-for-like comparison.
 * A partial cycle compares against the same number of days into the
 * previous cycle — comparing 9 days against a full month would just
 * report a fake decrease.
 */
export function previousRange(
  range: Range,
  cycleStartDay: number,
  now: number
): Range {
  const isCycle = range.label === "This cycle";

  if (isCycle) {
    const previous = billingCycleRange(cycleStartDay, now, -1);
    const elapsed = range.end - range.start;
    return {
      start: previous.start,
      end: Math.min(previous.start + elapsed, previous.end),
      label: "Previous cycle",
    };
  }

  const span = range.end - range.start;
  return {
    start: range.start - span,
    end: range.start,
    // Derive the label from the source rather than from the duration:
    // "Last 7 days" actually spans 6 days plus today, so counting days
    // back would produce a confusing "Previous 6 days".
    label: range.label.startsWith("Last ")
      ? range.label.replace(/^Last /, "Previous ")
      : range.label === "Today"
        ? "Yesterday (same hours)"
        : "Previous period",
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/features/usage/range.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: previous-period range for like-for-like comparison"
```

---

### Task 16: Compare screen

**Files:**
- Create: `src/app/compare.tsx`
- Create: `src/features/usage/DeltaRow.tsx`

**Interfaces:**
- Consumes: `compareUsage` and `UsageDelta` (already written and tested in Task 7), `previousRange`, `fetchUsage`
- Produces: `<DeltaRow delta />`

- [ ] **Step 1: Write `DeltaRow.tsx`**

```tsx
import { Text, View } from "react-native";
import { formatBytes } from "./format";
import type { UsageDelta } from "./aggregate";

export function DeltaRow({ delta }: { delta: UsageDelta }) {
  const up = delta.changePercent !== null && delta.changePercent > 0;
  const color =
    delta.changePercent === null ? "#666" : up ? "#D33" : "#2A2";

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 10,
      }}
    >
      <Text numberOfLines={1} style={{ flex: 1, marginRight: 12 }}>
        {delta.name}
      </Text>
      <Text style={{ opacity: 0.6, marginRight: 12 }}>
        {formatBytes(delta.previous)} → {formatBytes(delta.current)}
      </Text>
      <Text style={{ color, width: 72, textAlign: "right" }}>
        {delta.changePercent === null
          ? "new"
          : `${up ? "+" : ""}${Math.round(delta.changePercent)}%`}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Write the compare screen**

```tsx
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { NetworkFilterTabs } from "@/features/usage/NetworkFilterTabs";
import { RangePicker } from "@/features/usage/RangePicker";
import { DeltaRow } from "@/features/usage/DeltaRow";
import { compareUsage, type UsageDelta } from "@/features/usage/aggregate";
import { fetchUsage } from "@/features/usage/api";
import { formatBytes } from "@/features/usage/format";
import { previousRange } from "@/features/usage/range";
import { useUsageContext } from "@/features/usage/useUsageContext";

export default function Compare() {
  const { range, network, settings } = useUsageContext();
  const [deltas, setDeltas] = useState<UsageDelta[] | null>(null);
  const [totals, setTotals] = useState<{ now: number; before: number } | null>(null);

  const previous = useMemo(
    () => previousRange(range, settings?.cycleStartDay ?? 1, Date.now()),
    [range, settings?.cycleStartDay]
  );

  useEffect(() => {
    let cancelled = false;
    setDeltas(null);
    Promise.all([fetchUsage(range, network), fetchUsage(previous, network)])
      .then(([current, before]) => {
        if (cancelled) return;
        setDeltas(compareUsage(current.apps, before.apps));
        setTotals({ now: current.totals.total, before: before.totals.total });
      })
      .catch(() => {
        if (!cancelled) setDeltas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [range, previous, network]);

  const overall =
    totals && totals.before > 0
      ? ((totals.now - totals.before) / totals.before) * 100
      : null;

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <NetworkFilterTabs />
      <RangePicker />
      <Text style={{ opacity: 0.6 }}>
        {range.label} vs {previous.label}
      </Text>

      {totals && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 32, fontWeight: "700" }}>
            {formatBytes(totals.now)}
          </Text>
          <Text style={{ opacity: 0.7 }}>
            was {formatBytes(totals.before)}
            {overall !== null &&
              `  ·  ${overall > 0 ? "+" : ""}${Math.round(overall)}%`}
          </Text>
        </View>
      )}

      {!deltas && <ActivityIndicator />}

      {deltas && (
        <FlatList
          data={deltas.slice(0, 30)}
          keyExtractor={(d) => String(d.uid)}
          ListEmptyComponent={
            <Text style={{ opacity: 0.6 }}>Nothing to compare in this range.</Text>
          }
          renderItem={({ item }) => <DeltaRow delta={item} />}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 3: Verify on the device**

Expected: with "Last 7 days" selected, the comparison period reads "Previous 7 days" and its total is plausible. An app installed this week shows `new` rather than `+Infinity%`. Switching the network filter changes both sides of the comparison, not just one.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: period comparison screen with per-app movers"
```

---

# Phase 5 — Live monitor

**Gated on Phase 0 Q4.** Task 19 (device totals) is unconditional. Task 20 (per-app live) is built **only if Q4 recorded GO**; if NO-GO, skip it and delete `plan.md` §21 rather than leaving it as a promise.

---

### Task 19: Device-level live speed

**Files:**
- Create: `src/features/live/rate.ts`
- Create: `src/features/live/rate.test.ts`
- Create: `src/app/live.tsx`

**Interfaces:**
- Consumes: `NetworkUsage.getDeviceCounters()` from Task 4
- Produces:
  - `type Counters = { mobileRx: number; mobileTx: number; totalRx: number; totalTx: number }`
  - `type Sample = { down: number; up: number; mobileDown: number; wifiDown: number }`
  - `rateBetween(previous: Counters, current: Counters, elapsedMs: number): Sample | null`

- [ ] **Step 1: Write the failing test**

Create `src/features/live/rate.test.ts`:

```ts
import { rateBetween, type Counters } from "./rate";

const at = (over: Partial<Counters> = {}): Counters => ({
  mobileRx: 0,
  mobileTx: 0,
  totalRx: 0,
  totalTx: 0,
  ...over,
});

describe("rateBetween", () => {
  it("converts a byte delta over an interval into bytes per second", () => {
    const s = rateBetween(
      at({ totalRx: 0 }),
      at({ totalRx: 2_000_000 }),
      2000
    );
    expect(s!.down).toBe(1_000_000);
  });

  it("derives Wi-Fi as total minus mobile", () => {
    const s = rateBetween(
      at(),
      at({ totalRx: 1000, mobileRx: 400 }),
      1000
    );
    expect(s!.mobileDown).toBe(400);
    expect(s!.wifiDown).toBe(600);
  });

  it("returns null when the counters reset, rather than a negative rate", () => {
    // TrafficStats counters restart at boot.
    expect(rateBetween(at({ totalRx: 5000 }), at({ totalRx: 10 }), 1000)).toBeNull();
  });

  it("returns null when a counter is unsupported", () => {
    // TrafficStats returns -1 when the value is unavailable.
    expect(rateBetween(at(), at({ totalRx: -1 }), 1000)).toBeNull();
  });

  it("returns null for a zero or negative interval", () => {
    expect(rateBetween(at(), at({ totalRx: 100 }), 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/features/live/rate.test.ts`
Expected: FAIL — `Cannot find module './rate'`

- [ ] **Step 3: Implement**

Create `src/features/live/rate.ts`:

```ts
export type Counters = {
  mobileRx: number;
  mobileTx: number;
  totalRx: number;
  totalTx: number;
};

export type Sample = {
  down: number;
  up: number;
  mobileDown: number;
  wifiDown: number;
};

const UNSUPPORTED = -1;

export function rateBetween(
  previous: Counters,
  current: Counters,
  elapsedMs: number
): Sample | null {
  if (elapsedMs <= 0) return null;

  const values = [
    current.mobileRx,
    current.mobileTx,
    current.totalRx,
    current.totalTx,
  ];
  if (values.some((v) => v <= UNSUPPORTED)) return null;

  const perSecond = (a: number, b: number) => ((b - a) / elapsedMs) * 1000;

  const down = perSecond(previous.totalRx, current.totalRx);
  const up = perSecond(previous.totalTx, current.totalTx);
  const mobileDown = perSecond(previous.mobileRx, current.mobileRx);

  // Counters are cumulative since boot; a decrease means a reboot, not
  // negative traffic. Drop the sample and start again from this reading.
  if (down < 0 || up < 0 || mobileDown < 0) return null;

  return { down, up, mobileDown, wifiDown: Math.max(0, down - mobileDown) };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/features/live/rate.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the live screen**

Polling runs only while the screen is focused — this is the whole reason no foreground service is needed.

```tsx
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import NetworkUsage from "@modules/network-usage";
import { formatRate } from "@/features/usage/format";
import { UsageChart } from "@/features/usage/UsageChart";
import { rateBetween, type Counters, type Sample } from "@/features/live/rate";

const INTERVAL_MS = 1000;
const WINDOW = 60; // one minute of history on screen

export default function Live() {
  const [sample, setSample] = useState<Sample | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const previous = useRef<{ counters: Counters; at: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      previous.current = null;
      const id = setInterval(() => {
        const counters = NetworkUsage.getDeviceCounters();
        const now = Date.now();
        const last = previous.current;
        previous.current = { counters, at: now };
        if (!last) return;

        const next = rateBetween(last.counters, counters, now - last.at);
        if (!next) return;
        setSample(next);
        setHistory((h) => [...h, next].slice(-WINDOW));
      }, INTERVAL_MS);

      // Stops the moment the screen loses focus — no background polling.
      return () => clearInterval(id);
    }, [])
  );

  const bins = history.map((s, i) => ({
    start: i,
    end: i + 1,
    rxBytes: s.down,
    txBytes: s.up,
  }));

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 12, letterSpacing: 1, color: "#D33" }}>
        ● LIVE — DEVICE TOTAL
      </Text>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 36, fontWeight: "700" }}>
          ↓ {sample ? formatRate(sample.down) : "—"}
        </Text>
        <Text style={{ fontSize: 20 }}>
          ↑ {sample ? formatRate(sample.up) : "—"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 24 }}>
        <Text>Mobile {sample ? formatRate(sample.mobileDown) : "—"}</Text>
        <Text>Wi-Fi {sample ? formatRate(sample.wifiDown) : "—"}</Text>
      </View>

      <UsageChart bins={bins} height={140} />

      <Text style={{ fontSize: 12, opacity: 0.6 }}>
        Live speed is measured for the whole device. Per-app figures are
        historical totals, not live rates — see the dashboard.
      </Text>
    </View>
  );
}
```

That closing note is the §22 distinction from `plan.md`, enforced in copy rather than left to the user to infer.

- [ ] **Step 6: Verify on the device**

Expected: start a video and the download figure rises to a plausible rate within two seconds; pause it and the figure falls to near zero. On Wi-Fi, `Mobile` stays at 0 and `Wi-Fi` carries the traffic; switch to mobile data and they swap. Navigate away and back — the chart resets and no polling continues in between (confirm with a temporary log in the interval).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: live device-level speed monitor, foreground only"
```

---

### Task 20: Per-app live list — GO branch only

**Build this only if `docs/findings/phase-0.md` Q4 recorded GO.** If NO-GO: skip, and delete §20–§21 from `plan.md` so the promise does not survive in the document.

**Files:**
- Modify: `src/app/live.tsx`
- Create: `src/features/live/useLiveApps.ts`

**Interfaces:**
- Consumes: `fetchUsage`
- Produces: `useLiveApps(windowMs: number, intervalMs: number): AppUsage[]`

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchUsage } from "@/features/usage/api";
import type { AppUsage } from "@/features/usage/aggregate";

/**
 * Recent per-app bytes, re-queried on an interval. This is "bytes in the
 * last N seconds", NOT a per-app rate — Android does not expose per-app
 * live throughput. The UI must label it accordingly.
 */
export function useLiveApps(windowMs: number, intervalMs: number): AppUsage[] {
  const [apps, setApps] = useState<AppUsage[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const tick = async () => {
        const now = Date.now();
        try {
          const { apps: rows } = await fetchUsage(
            { start: now - windowMs, end: now, label: "live" },
            "ALL"
          );
          if (!cancelled) setApps(rows.filter((a) => a.total > 0).slice(0, 8));
        } catch {
          // A failed poll is not worth surfacing; the next one will retry.
        }
      };

      tick();
      const id = setInterval(tick, intervalMs);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }, [windowMs, intervalMs])
  );

  return apps;
}
```

- [ ] **Step 2: Add the list to the live screen**

Below the device totals, render `useLiveApps(30_000, 5_000)` as name + `formatBytes(total)`, under a heading that states the window explicitly:

```tsx
<Text style={{ fontWeight: "600" }}>Apps · last 30 seconds</Text>
```

Never render these values through `formatRate`. They are byte totals over a window, and calling them MB/s would be the exact dishonesty this project is built to avoid.

- [ ] **Step 3: Verify on the device**

Expected: streaming an app makes it appear at the top of the list within one or two poll intervals, and it drops away roughly 30 seconds after you stop. If the list stays empty, Q4 was really a NO-GO — revert this task and take the NO-GO branch.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: recent per-app usage list on the live screen"
```

---

# Phase 6 — Export and updates

---

### Task 21: CSV and JSON export

**Files:**
- Modify: `package.json`
- Create: `src/features/export/csv.ts`
- Create: `src/features/export/csv.test.ts`
- Create: `src/features/export/share.ts`
- Modify: `src/app/index.tsx`

**Interfaces:**
- Produces:
  - `toCsv(apps: AppUsage[], range: Range, network: NetworkFilter): string`
  - `toJson(apps: AppUsage[], range: Range, network: NetworkFilter): string`
  - `shareExport(content: string, filename: string, mimeType: string): Promise<void>`

- [ ] **Step 1: Install the packages**

```bash
npx expo install expo-sharing expo-file-system
```

- [ ] **Step 2: Write the failing test**

Create `src/features/export/csv.test.ts`:

```ts
import type { AppUsage } from "@/features/usage/aggregate";
import type { Range } from "@/features/usage/range";
import { toCsv, toJson } from "./csv";

const range: Range = { start: 1_700_000_000_000, end: 1_700_086_400_000, label: "Today" };

const app = (over: Partial<AppUsage> = {}): AppUsage => ({
  uid: 10001,
  name: "Example",
  packageName: "com.example",
  download: 1000,
  upload: 100,
  total: 1100,
  foreground: 700,
  background: 400,
  percentage: 100,
  ...over,
});

describe("toCsv", () => {
  it("starts with a header row", () => {
    expect(toCsv([app()], range, "MOBILE").split("\n")[0]).toBe(
      "app,package,uid,network,range_start,range_end,download_bytes,upload_bytes,total_bytes,foreground_bytes,background_bytes"
    );
  });

  it("writes raw byte counts, not formatted sizes", () => {
    const row = toCsv([app()], range, "MOBILE").split("\n")[1];
    expect(row).toContain(",1000,100,1100,");
    expect(row).not.toContain("KB");
  });

  it("quotes and escapes a name containing a comma or quote", () => {
    const row = toCsv([app({ name: 'Bob"s, App' })], range, "MOBILE").split("\n")[1];
    expect(row.startsWith('"Bob""s, App",')).toBe(true);
  });

  it("emits ISO timestamps so the range is unambiguous", () => {
    expect(toCsv([app()], range, "MOBILE")).toContain(
      new Date(range.start).toISOString()
    );
  });

  it("returns just the header for no apps", () => {
    expect(toCsv([], range, "MOBILE").split("\n")).toHaveLength(1);
  });
});

describe("toJson", () => {
  it("wraps the rows with the query that produced them", () => {
    const parsed = JSON.parse(toJson([app()], range, "WIFI"));
    expect(parsed.network).toBe("WIFI");
    expect(parsed.rangeStart).toBe(new Date(range.start).toISOString());
    expect(parsed.apps).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx jest src/features/export/csv.test.ts`
Expected: FAIL — `Cannot find module './csv'`

- [ ] **Step 4: Implement**

Create `src/features/export/csv.ts`:

```ts
import type { NetworkFilter } from "@modules/network-usage";
import type { AppUsage } from "@/features/usage/aggregate";
import type { Range } from "@/features/usage/range";

const HEADER = [
  "app",
  "package",
  "uid",
  "network",
  "range_start",
  "range_end",
  "download_bytes",
  "upload_bytes",
  "total_bytes",
  "foreground_bytes",
  "background_bytes",
].join(",");

/** RFC 4180: wrap in quotes and double any embedded quote. */
function escape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(
  apps: AppUsage[],
  range: Range,
  network: NetworkFilter
): string {
  const start = new Date(range.start).toISOString();
  const end = new Date(range.end).toISOString();

  const rows = apps.map((a) =>
    [
      escape(a.name),
      escape(a.packageName ?? ""),
      a.uid,
      network,
      start,
      end,
      // Raw bytes, never formatted — a spreadsheet cannot sum "1.2 GB".
      a.download,
      a.upload,
      a.total,
      a.foreground,
      a.background,
    ].join(",")
  );

  return [HEADER, ...rows].join("\n");
}

export function toJson(
  apps: AppUsage[],
  range: Range,
  network: NetworkFilter
): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      network,
      rangeStart: new Date(range.start).toISOString(),
      rangeEnd: new Date(range.end).toISOString(),
      apps,
    },
    null,
    2
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest src/features/export/csv.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Write `share.ts`**

```ts
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function shareExport(
  content: string,
  filename: string,
  mimeType: string
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device");
  }
  // Cache directory: the OS reclaims it, and the file only needs to survive
  // long enough for the share sheet to read it.
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: "Export usage" });
}
```

If SDK 57's `File`/`Paths` API is unavailable in your install, use the legacy entry point instead — same behaviour, older names:

```ts
import * as FileSystem from "expo-file-system/legacy";
const uri = FileSystem.cacheDirectory + filename;
await FileSystem.writeAsStringAsync(uri, content);
await Sharing.shareAsync(uri, { mimeType });
```

- [ ] **Step 7: Add the export action**

On the dashboard header, an "Export" button offering CSV and JSON, building the filename from the range:

```ts
const stamp = new Date(range.start).toISOString().slice(0, 10);
await shareExport(
  toCsv(apps, range, network),
  `usage-${network.toLowerCase()}-${stamp}.csv`,
  "text/csv"
);
```

- [ ] **Step 8: Verify on the device**

Expected: the Android share sheet opens; saving to Drive or Files produces a file that opens in a spreadsheet with one row per app and numeric byte columns that sum to the dashboard total.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: CSV and JSON export via the Android share sheet"
```

---

### Task 22: Over-the-air JS updates

**Files:**
- Modify: `package.json`, `app.json`
- Create: `eas.json`
- Create: `src/features/updates/ota.ts`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Produces: `checkForOtaUpdate(): Promise<"none" | "downloaded" | "error">`, `applyOtaUpdate(): Promise<void>`

- [ ] **Step 1: Install and configure**

```bash
npx expo install expo-updates
npx eas update:configure
```

`eas update:configure` writes the `updates.url` and `runtimeVersion` into `app.json`. Confirm it produced:

```json
    "updates": {
      "url": "https://u.expo.dev/<project-id>",
      "checkAutomatically": "ON_LOAD",
      "fallbackToCacheTimeout": 0
    },
    "runtimeVersion": {
      "policy": "fingerprint"
    }
```

The `fingerprint` policy is the load-bearing part: it hashes the native project, so an APK built before a Kotlin change will not accept a JS bundle built after it. That is exactly the safety `plan.md` §50 was worried about, handled by configuration rather than by giving up on OTA.

- [ ] **Step 2: Write `ota.ts`**

```ts
import * as Updates from "expo-updates";

export async function checkForOtaUpdate(): Promise<"none" | "downloaded" | "error"> {
  // Never runs in development — there is no bundle to replace.
  if (__DEV__ || !Updates.isEnabled) return "none";
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return "none";
    await Updates.fetchUpdateAsync();
    return "downloaded";
  } catch {
    // An offline device is the normal case here, not an error worth showing.
    return "error";
  }
}

export async function applyOtaUpdate(): Promise<void> {
  await Updates.reloadAsync();
}
```

- [ ] **Step 3: Prompt on the next launch, not mid-session**

In `_layout.tsx`, call `checkForOtaUpdate()` on mount; if it returns `"downloaded"`, show a dismissible banner offering "Restart to update" wired to `applyOtaUpdate`. Do not reload without asking — a reload during use loses whatever the user was doing.

- [ ] **Step 4: Publish and verify the round trip**

```bash
eas update --branch production --message "test update"
```

Expected: install the release APK, change a visible string, publish an update, force-close and reopen the app twice — the banner appears on the second launch and restarting shows the new string. Then bump something native (add a Kotlin function), publish again, and confirm the old APK does **not** receive it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: over-the-air JS updates with fingerprint runtime versioning"
```

---

### Task 23: APK updates from GitHub Releases

For native changes, which OTA cannot deliver.

**Files:**
- Create: `modules/network-usage/android/src/main/java/expo/modules/networkusage/ApkInstaller.kt`
- Create: `modules/network-usage/android/src/main/res/xml/apk_paths.xml`
- Modify: `modules/network-usage/android/src/main/AndroidManifest.xml`
- Modify: `.../NetworkUsageModule.kt`, `modules/network-usage/index.ts`
- Create: `src/features/updates/apk.ts`
- Create: `src/features/updates/apk.test.ts`
- Create: `src/app/update.tsx`

**Interfaces:**
- Produces:
  - `isNewerVersion(latestTag: string, currentVersion: string): boolean`
  - `fetchLatestRelease(repo: string): Promise<ReleaseInfo | null>`
  - `type ReleaseInfo = { version: string; notes: string; apkUrl: string | null }`
  - `NetworkUsage.canInstallPackages(): boolean`
  - `NetworkUsage.openInstallPermissionSettings(): void`
  - `NetworkUsage.installApk(fileUri: string): void`

- [ ] **Step 1: Write the failing test**

Create `src/features/updates/apk.test.ts`:

```ts
import { isNewerVersion } from "./apk";

describe("isNewerVersion", () => {
  it("compares semantic versions numerically, not as strings", () => {
    // String comparison would call "1.10.0" older than "1.9.0".
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true);
  });

  it("tolerates a leading v on the tag", () => {
    expect(isNewerVersion("v1.2.0", "1.1.0")).toBe(true);
  });

  it("is false for the same version", () => {
    expect(isNewerVersion("1.2.0", "1.2.0")).toBe(false);
  });

  it("is false for an older tag", () => {
    expect(isNewerVersion("1.1.9", "1.2.0")).toBe(false);
  });

  it("treats a missing patch segment as zero", () => {
    expect(isNewerVersion("1.3", "1.2.9")).toBe(true);
  });

  it("is false for an unparseable tag rather than prompting a bad update", () => {
    expect(isNewerVersion("nightly", "1.2.0")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/features/updates/apk.test.ts`
Expected: FAIL — `Cannot find module './apk'`

- [ ] **Step 3: Implement `apk.ts`**

No `latest.json` to maintain — the GitHub API already reports the latest tag and its assets.

```ts
export type ReleaseInfo = {
  version: string;
  notes: string;
  apkUrl: string | null;
};

function parse(version: string): number[] | null {
  const cleaned = version.trim().replace(/^v/i, "");
  if (!/^\d+(\.\d+)*$/.test(cleaned)) return null;
  return cleaned.split(".").map(Number);
}

export function isNewerVersion(latestTag: string, currentVersion: string): boolean {
  const latest = parse(latestTag);
  const current = parse(currentVersion);
  // An unparseable tag must never be treated as an upgrade.
  if (!latest || !current) return false;

  const length = Math.max(latest.length, current.length);
  for (let i = 0; i < length; i++) {
    const a = latest[i] ?? 0;
    const b = current[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

export async function fetchLatestRelease(repo: string): Promise<ReleaseInfo | null> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) return null;

  const json = await response.json();
  const asset = (json.assets ?? []).find((a: { name: string }) =>
    a.name.endsWith(".apk")
  );

  return {
    version: json.tag_name ?? "",
    notes: json.body ?? "",
    apkUrl: asset?.browser_download_url ?? null,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/features/updates/apk.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Declare the FileProvider**

Android will not install an APK from a raw `file://` URI. Create `modules/network-usage/android/src/main/res/xml/apk_paths.xml`:

```xml
<paths>
    <cache-path name="apk" path="." />
    <files-path name="files" path="." />
</paths>
```

Add to the module's `AndroidManifest.xml`, inside `<manifest>`:

```xml
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />

    <application>
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.apkprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/apk_paths" />
        </provider>
    </application>
```

- [ ] **Step 6: Write `ApkInstaller.kt`**

```kotlin
package expo.modules.networkusage

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

object ApkInstaller {

    fun canInstall(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }

    /** Sends the user to the per-app "install unknown apps" toggle. */
    fun openPermissionSettings(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${context.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    fun install(context: Context, fileUri: String) {
        val file = File(Uri.parse(fileUri).path ?: fileUri)
        val contentUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.apkprovider",
            file
        )
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(contentUri, "application/vnd.android.package-archive")
            .addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
            )
        context.startActivity(intent)
    }
}
```

Expose all three from the module definition and add them to the TS declaration in `index.ts`.

- [ ] **Step 7: Write the update screen**

```bash
npx expo install expo-application
```

Create `src/app/update.tsx`:

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, Button, ScrollView, Text, View } from "react-native";
import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import NetworkUsage from "@modules/network-usage";
import { fetchLatestRelease, isNewerVersion, type ReleaseInfo } from "@/features/updates/apk";

const REPO = "<owner>/<repo>"; // set to your GitHub repository

export default function Update() {
  const current = Application.nativeApplicationVersion ?? "0.0.0";
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchLatestRelease(REPO)
      .then(setRelease)
      .catch(() => setMessage("Could not reach GitHub."))
      .finally(() => setChecking(false));
  }, []);

  const newer =
    release !== null && isNewerVersion(release.version, current) && release.apkUrl;

  const download = async () => {
    if (!release?.apkUrl) return;

    // Ask for install permission before spending bandwidth on the download.
    if (!NetworkUsage.canInstallPackages()) {
      setMessage("Allow installing unknown apps, then tap Download again.");
      NetworkUsage.openInstallPermissionSettings();
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const target = new File(Paths.cache, "update.apk");
      if (target.exists) target.delete();
      const downloaded = await File.downloadFileAsync(release.apkUrl, target);
      NetworkUsage.installApk(downloaded.uri);
    } catch (e) {
      setMessage(`Download failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Text style={{ opacity: 0.6 }}>Installed version {current}</Text>

      {checking && <ActivityIndicator />}

      {!checking && !newer && (
        <Text style={{ fontSize: 18 }}>You are up to date.</Text>
      )}

      {newer && release && (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: "700" }}>
            Version {release.version} available
          </Text>
          <Text>{release.notes}</Text>
          <Text style={{ fontSize: 12, opacity: 0.7 }}>
            Android will warn that this app is from an unknown source. That is
            expected — this app is distributed outside the Play Store.
          </Text>
          {busy ? (
            <ActivityIndicator />
          ) : (
            <Button title="Download and install" onPress={download} />
          )}
        </View>
      )}

      {message && <Text style={{ color: "#D33" }}>{message}</Text>}
    </ScrollView>
  );
}
```

If `File.downloadFileAsync` is not present in your SDK 57 install, use the legacy call instead and pass its `uri` to `installApk`:

```ts
import * as FileSystem from "expo-file-system/legacy";
const { uri } = await FileSystem.downloadAsync(
  release.apkUrl,
  FileSystem.cacheDirectory + "update.apk"
);
```

- [ ] **Step 8: Verify on the device**

Expected: publish a GitHub release tagged one patch above the installed version with an APK attached; the screen offers it, the download completes, the permission prompt appears if unknown sources are off, and the system installer opens and upgrades in place — keeping your existing settings and cycle configuration.

Also confirm the negative case: with the newest version installed, the screen reports "up to date" rather than offering a reinstall.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: APK update channel via GitHub Releases with FileProvider install"
```

---

# Phase 7 — Retention archive

**Build only when needed.** Android keeps roughly 90 days of per-UID detail. Until a user notices data disappearing off the back of their history, this whole phase is speculative. The trigger to build it: a range that previously returned data starts returning empty.

---

### Task 24: Daily snapshot archive

**Files:**
- Create: `src/features/archive/db.ts`
- Create: `src/features/archive/merge.ts`
- Create: `src/features/archive/merge.test.ts`
- Modify: `src/features/limits/backgroundCheck.ts`
- Modify: `src/features/usage/api.ts`

**Interfaces:**
- Produces:
  - `openArchive(): Promise<SQLiteDatabase>`
  - `snapshotDay(dayStart: number): Promise<void>`
  - `readArchive(start: number, end: number, network: NetworkFilter): Promise<AppUsage[]>`
  - `splitRange(range, cutoff): { archived: Range | null; live: Range | null }`
  - `mergeUsage(a: AppUsage[], b: AppUsage[]): AppUsage[]`

- [ ] **Step 1: Write the failing test**

Create `src/features/archive/merge.test.ts`:

```ts
import type { AppUsage } from "@/features/usage/aggregate";
import { mergeUsage, splitRange } from "./merge";

const DAY = 86_400_000;
const app = (uid: number, total: number): AppUsage => ({
  uid,
  name: `App ${uid}`,
  packageName: `com.app${uid}`,
  download: total,
  upload: 0,
  total,
  foreground: 0,
  background: 0,
  percentage: 0,
});

describe("splitRange", () => {
  const cutoff = 100 * DAY;

  it("sends a fully recent range to the live source only", () => {
    const r = { start: 101 * DAY, end: 102 * DAY, label: "x" };
    const split = splitRange(r, cutoff);
    expect(split.archived).toBeNull();
    expect(split.live).toEqual(r);
  });

  it("sends a fully old range to the archive only", () => {
    const r = { start: 10 * DAY, end: 20 * DAY, label: "x" };
    const split = splitRange(r, cutoff);
    expect(split.live).toBeNull();
    expect(split.archived).toEqual(r);
  });

  it("splits a range that straddles the cutoff", () => {
    const r = { start: 90 * DAY, end: 110 * DAY, label: "x" };
    const split = splitRange(r, cutoff);
    expect(split.archived).toEqual({ start: 90 * DAY, end: cutoff, label: "x" });
    expect(split.live).toEqual({ start: cutoff, end: 110 * DAY, label: "x" });
  });
});

describe("mergeUsage", () => {
  it("sums the same app across both sources", () => {
    const merged = mergeUsage([app(1, 100)], [app(1, 50)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].total).toBe(150);
  });

  it("keeps apps present in only one source", () => {
    const merged = mergeUsage([app(1, 100)], [app(2, 50)]);
    expect(merged).toHaveLength(2);
  });

  it("recomputes percentages over the merged total", () => {
    const merged = mergeUsage([app(1, 75)], [app(2, 25)]);
    expect(merged[0].percentage).toBeCloseTo(75);
  });

  it("returns the other side unchanged when one is empty", () => {
    expect(mergeUsage([], [app(1, 10)])[0].total).toBe(10);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest src/features/archive/merge.test.ts`
Expected: FAIL — `Cannot find module './merge'`

- [ ] **Step 3: Implement `merge.ts`**

```ts
import type { AppUsage } from "@/features/usage/aggregate";
import type { Range } from "@/features/usage/range";

/** Splits a request into the part the archive owns and the part Android still has. */
export function splitRange(
  range: Range,
  cutoff: number
): { archived: Range | null; live: Range | null } {
  if (range.end <= cutoff) return { archived: range, live: null };
  if (range.start >= cutoff) return { archived: null, live: range };
  return {
    archived: { start: range.start, end: cutoff, label: range.label },
    live: { start: cutoff, end: range.end, label: range.label },
  };
}

export function mergeUsage(a: AppUsage[], b: AppUsage[]): AppUsage[] {
  const byUid = new Map<number, AppUsage>();

  for (const row of [...a, ...b]) {
    const existing = byUid.get(row.uid);
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

  const merged = [...byUid.values()];
  const grandTotal = merged.reduce((sum, r) => sum + r.total, 0);
  for (const row of merged) {
    row.percentage = grandTotal === 0 ? 0 : (row.total / grandTotal) * 100;
  }
  return merged.sort((x, y) => y.total - x.total);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/features/archive/merge.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write `db.ts`**

One table. Daily granularity, per app, per network — enough for every screen in this app beyond 90 days, and small enough to keep for years.

```ts
import * as SQLite from "expo-sqlite";
import type { NetworkFilter } from "@modules/network-usage";
import { fetchUsage } from "@/features/usage/api";
import type { AppUsage } from "@/features/usage/aggregate";

const DAY = 86_400_000;
let db: SQLite.SQLiteDatabase | null = null;

export async function openArchive(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("usage-archive.db");
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS daily_usage (
      day_start     INTEGER NOT NULL,
      uid           INTEGER NOT NULL,
      network       TEXT    NOT NULL,
      app_name      TEXT,
      package_name  TEXT,
      download      INTEGER NOT NULL,
      upload        INTEGER NOT NULL,
      PRIMARY KEY (day_start, uid, network)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_day ON daily_usage(day_start);
  `);
  return db;
}

/** Idempotent: re-running for the same day overwrites rather than duplicating. */
export async function snapshotDay(dayStart: number): Promise<void> {
  const archive = await openArchive();
  for (const network of ["MOBILE", "WIFI"] as const) {
    const { apps } = await fetchUsage(
      { start: dayStart, end: dayStart + DAY, label: "snapshot" },
      network
    );
    await archive.withTransactionAsync(async () => {
      for (const a of apps) {
        await archive.runAsync(
          `INSERT OR REPLACE INTO daily_usage
             (day_start, uid, network, app_name, package_name, download, upload)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          dayStart, a.uid, network, a.name, a.packageName, a.download, a.upload
        );
      }
    });
  }
}

export async function readArchive(
  start: number,
  end: number,
  network: NetworkFilter
): Promise<AppUsage[]> {
  const archive = await openArchive();
  const networkClause = network === "ALL" ? "" : "AND network = ?";
  const params: (number | string)[] = [start, end];
  if (network !== "ALL") params.push(network);

  const rows = await archive.getAllAsync<{
    uid: number;
    app_name: string | null;
    package_name: string | null;
    download: number;
    upload: number;
  }>(
    `SELECT uid, app_name, package_name,
            SUM(download) AS download, SUM(upload) AS upload
       FROM daily_usage
      WHERE day_start >= ? AND day_start < ? ${networkClause}
      GROUP BY uid`,
    ...params
  );

  const total = rows.reduce((sum, r) => sum + r.download + r.upload, 0);
  return rows.map((r) => ({
    uid: r.uid,
    name: r.app_name ?? `UID ${r.uid}`,
    packageName: r.package_name,
    download: r.download,
    upload: r.upload,
    total: r.download + r.upload,
    // Daily snapshots do not preserve the state split.
    foreground: 0,
    background: 0,
    percentage: total === 0 ? 0 : ((r.download + r.upload) / total) * 100,
  }));
}
```

- [ ] **Step 6: Snapshot from the existing background task**

In `runUsageCheck`, after the threshold checks, snapshot yesterday:

```ts
const yesterdayStart = presetRange("yesterday", now).start;
await snapshotDay(yesterdayStart);
```

Yesterday rather than today, because a complete day is worth storing and a partial one would be overwritten anyway. `INSERT OR REPLACE` makes repeated runs harmless.

- [ ] **Step 7: Read through the archive in `api.ts`**

Wrap `fetchUsage` so old ranges fall back to the archive:

```ts
const RETENTION_DAYS = 80; // conservatively inside Android's ~90-day window

export async function fetchUsageWithArchive(
  range: Range,
  network: NetworkFilter
): Promise<UsageResult> {
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  const { archived, live } = splitRange(range, cutoff);

  const [oldApps, newResult] = await Promise.all([
    archived ? readArchive(archived.start, archived.end, network) : [],
    live ? fetchUsage(live, network) : null,
  ]);

  const apps = mergeUsage(oldApps, newResult?.apps ?? []);
  return { apps, totals: sumUsage(apps), note: newResult?.note ?? null };
}
```

Point the dashboard, compare screen and limits at `fetchUsageWithArchive`. Leave `fetchUsage` as-is for the background check and snapshots, which must always read Android directly.

- [ ] **Step 8: Verify on the device**

Expected: call `snapshotDay` manually for the last three days, then query a range covering them via `fetchUsageWithArchive` with `RETENTION_DAYS` temporarily set to 1 so those days fall on the archived side. The totals must match what the dashboard showed for the same days before the change. Run `snapshotDay` twice for one day and confirm the totals do not double.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: daily usage archive with read-through beyond Android retention"
```

---

# Release checklist

Not a task — the gate before handing an APK to anyone. Covers `plan.md` §62–63.

- [ ] **Android versions.** Install and run the core flows on at least three: one of 10/11, one of 12/13, one of 14/15/16. Usage-access UI, per-app totals, and background notifications are the three that break across versions.
- [ ] **Manufacturers.** If you can reach them, test one Pixel/stock device plus one Samsung and one Xiaomi. Aggressive battery management on the latter two is the most common cause of the background check never running.
- [ ] **Network transitions.** Wi-Fi → mobile, mobile → Wi-Fi, both → VPN, and airplane mode. After each, confirm the mobile and Wi-Fi figures still separate correctly and nothing is double-counted.
- [ ] **Reboot.** Confirm the live screen recovers (Task 19's counter-reset guard) and the background task is still registered.
- [ ] **Battery saver on.** Confirm the app still opens and reads history; note in the release whether background alerts survive it on the test device.
- [ ] **Permission revoked mid-use.** Turn off usage access in Settings while the app is open. Expected: the gate screen returns, not a crash or a screen full of zeros.
- [ ] **Fresh install.** Onboarding, permission grant, and a first query with no settings saved.
- [ ] **Upgrade install.** Install the previous APK, set a limit and cycle day, then install the new one over it and confirm settings and archive survive.
- [ ] `npx jest` passes.
- [ ] `docs/findings/phase-0.md` decisions still match the shipped behaviour — if per-app live was NO-GO, no screen claims otherwise.

---

## Deliberately not built

Named here so they do not get quietly reintroduced:

- **Foreground service.** Nothing in this plan needs one, and Android 14/15 restrictions make one a liability.
- **Cloud sync, accounts, multi-device** (`plan.md` P3). No server means no privacy policy, no auth, no breach. If this ever changes, it is a new project, not a phase.
- **Per-SIM breakdown.** Not available without carrier privileges.
- **Per-SSID Wi-Fi breakdown.** Needs hidden APIs.
- **PDF export.** CSV opens in every spreadsheet; PDF is a rendering dependency for no additional information.
- **App icons in lists.** Requires extracting and caching drawables through the bridge. Add it when the list feels bare, not before.
