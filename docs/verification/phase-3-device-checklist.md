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
