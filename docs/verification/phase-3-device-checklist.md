# Phase 3 — on-device verification checklist

**Nothing in Task 13 has ever executed.** `limitStatus()` (Task 12) has unit
coverage, but the screen built on top of it — the Settings-tab limit form,
`LimitCard`'s two-bar progress display, the dashboard's cycle-scoped query,
the new `warning` colour token, and the Arabic translations — has only been
verified by `tsc --noEmit` and `jest`. This environment has no Android device
and no emulator, so every claim below is static analysis until this pass runs.

```
npx expo prebuild --clean
npx expo run:android
```

---

## 1. The load-bearing checks

- [ ] **The number is right.** With a real billing-cycle day set, the
      `LimitCard` "used" figure on the Settings tab matches Android's own
      Settings → Network & internet → Data usage for the same cycle window.
- [ ] **Cycle day changes the window.** Change "Billing cycle starts on day"
      to today's date, Save. The used figure drops to today's usage only
      (the cycle now started today).
- [ ] **Empty limit clears it.** Clear the "Monthly mobile limit (GB)" field
      and Save. `mobileLimitBytes` saves as `null` — the `LimitCard`
      disappears (replaced by the "Set a mobile data limit to track it."
      line) on both the Settings tab and the dashboard. It must never render
      `NaN` anywhere.
- [ ] **Save persists across restart.** Set a limit, warn percent and cycle
      day; force-quit and reopen. All three fields repopulate from storage.
- [ ] **State machine.** With a small limit (e.g. 0.01 GB) and normal mobile
      use: card starts `ok` (accent blue), crosses `warnAtPercent` into
      `warn` (new amber `warning` token — confirm it reads as its own colour,
      not "blue" or "red-ish"), then crosses the limit into `over` (danger
      red, "Over by …" text replaces "… left").

## 2. Settings tab

- [ ] The limit Section sits above "Show system apps", below "Language".
- [ ] Toast confirms on save (`Limit saved.`) and on a simulated failure
      path (`Could not save the limit.`) — hard to force a real failure;
      at minimum confirm the success toast fires and the values reload.
- [ ] Out-of-range input (warn 150, cycle day 40, negative limit) silently
      clamps to the defaults documented in the brief (warn 80, cycle day 1,
      no limit) rather than crashing or saving garbage.
- [ ] Numeric keyboard opens for all three fields.
- [ ] No duplicate "Show system apps" control was introduced — the existing
      switch below the limit Section is still the only one.

## 3. Dashboard placement

- [ ] With a limit set and the network filter on `Mobile`, `LimitCard`
      appears above `TotalsCard`.
- [ ] Switch the filter to `Wi-Fi` or `All`: the card disappears. Switch back
      to `Mobile`: it reappears, still scoped to the billing cycle
      regardless of whatever range chip (Today, Last 7 days, …) is active.
- [ ] No `/limits` route exists and nothing tries to navigate to it.

## 4. Language

- [ ] Arabic: every `limits.*` string renders in Arabic prose with Latin
      byte units and digits (matching the rest of the app), never a raw key
      name like `limits.title`.
- [ ] RTL layout: the limit Section's fields, labels and Save button mirror
      correctly.

## 5. Presentation and accessibility

- [ ] Dark mode: both progress bars, the amber `warning` state, and all text
      are readable. Confirm `warning` does not read as "the same as accent"
      or "the same as danger" in either theme.
- [ ] TalkBack on the `LimitCard`'s progress area announces the combined
      `limits.a11y` sentence (used, limit, percent, elapsed) as one node —
      not two separate silent decorative bars, not a double reading of the
      same numbers.
- [ ] TalkBack still separately announces the "remaining/over" line and the
      projection sentence below the bars (they are outside the progressbar
      node, by design — confirm they are not swallowed).
- [ ] Largest system font: the limit Section's fields and card do not clip
      or overlap.

---

## Follow-up, not part of this pass

**Task 14 (background notifications)** builds on `limitStatus()`'s `warn`/
`over` states and `detectSpike()`, neither of which this task added UI for
beyond the passive card. Notification-triggering behaviour is out of scope
here and unverified by this checklist.

---

## 6. Task 14 — background threshold checks and notifications

**Nothing in Task 14 has ever executed.** `ensureNotificationSetup`, `notify`,
`registerBackgroundCheck` and `runUsageCheck` are only verified by
`tsc --noEmit` and `jest` (60 passing, unchanged — the new code has no unit
tests of its own; it is a thin composition of already-tested `limits.ts` and
`range.ts` functions plus I/O this environment cannot exercise). This
environment has no Android device and no emulator, so none of the following
has run.

**First, rebuild the dev client** — `expo-notifications`, `expo-background-task`
and `expo-task-manager` are new native modules; a JS reload will not pick them
up.

```
npx expo prebuild --clean
npx expo run:android
```

- [ ] **Logic, forced `over`.** In Settings, set the mobile limit just below
      current cycle usage. From the Probe tab (add a temporary button calling
      `runUsageCheck(Date.now())` from `@/features/limits/backgroundCheck` —
      remove it afterwards, it is not shipped code), confirm it returns
      `"posted"` and the "Mobile data limit reached" notification arrives
      with the correct used/limit figures.
- [ ] **Logic, forced `warn`.** Set the limit so current usage sits at or
      above `warnAtPercent` but below the limit. Confirm `"posted"` and the
      "N% of your data used" notification, with correct remaining bytes and
      cycle-remaining percent.
- [ ] **Logic, `ok`.** Set a high limit. Confirm `runUsageCheck` returns
      `"quiet"` with no notification.
- [ ] **Once-per-cycle rule.** Immediately after any `"posted"` result above,
      call `runUsageCheck(Date.now())` again. Confirm it returns `"quiet"`
      and no second notification appears. Confirm `Settings.lastAlert` in
      storage carries the fired key.
- [ ] **New cycle re-arms.** With `lastAlert` set from a prior cycle, advance
      past the next `cycleStartDay` (or change `cycleStartDay` to force a new
      cycle) and confirm a still-qualifying state posts again — the alert key
      includes the cycle start, so a new cycle is a new key.
- [ ] **Scheduling.** With the app backgrounded, trigger the task manually:
      ```
      adb shell cmd jobscheduler run -f com.anonymous.network_tracker 0
      ```
      Expected: the notification arrives with the app in the background,
      using whatever state (`over`/`warn`/spike/quiet) is currently true.
- [ ] **Permission denial.** Deny the notification permission when prompted.
      Confirm `ensureNotificationSetup()` returns `false` and
      `registerBackgroundCheck()` is never called (check
      `TaskManager.isTaskRegisteredAsync` stays `false`).
- [ ] **Web build is inert.** `npx expo start --web` (or the static web
      build) loads without throwing — the `Platform.OS !== 'android'` guards
      in `_layout.tsx` and `registerBackgroundCheck()` mean
      `ensureNotificationSetup`/`registerBackgroundCheck`/`defineTask` never
      run there.
- [ ] **`HISTORY_DAYS` timeout question.** `runUsageCheck`'s spike check
      issues 15 sequential `fetchUsage` calls (today + 14 history days),
      each hitting `NetworkStatsManager`. `HISTORY_DAYS` is left at 14 per
      the plan's own guidance — confirm on-device that the background task
      does not time out. If it does, drop `HISTORY_DAYS` in
      `src/features/limits/backgroundCheck.ts` to 7 and record that change
      here.
- [ ] **Arabic.** Switch language to Arabic, force a `warn` or `over` state,
      and confirm the notification title/body render in Arabic prose with
      Latin byte units and digits, not a raw `alerts.*` key.
- [ ] **Channel name.** Confirm the "Usage alerts" (or Arabic
      "تنبيهات الاستهلاك") channel appears correctly in Android's
      per-app notification settings. Note: the channel name is fixed at
      whichever language was active when the channel was first created — this
      is an accepted limitation, not a bug to fix.
