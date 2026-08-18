# Phase 2 — on-device verification checklist

**Nothing native in Phase 2 has ever executed.** The chart renderer
(`react-native-svg`), the date picker (`@react-native-community/datetimepicker`)
and the new `openAppDataUsageSettings` Kotlin function all arrived in this phase
and all need a rebuild. Every claim about them — from the implementers, the
reviewer, and me — is static analysis until this pass runs.

```
npx expo prebuild --clean
npx expo run:android
```

Restart any stale `expo start` watcher first; one was observed rewriting
`.expo/types/router.d.ts` with junk routes during this phase.

---

## 1. The load-bearing checks

Do these first. If one fails, the rest is noise.

- [ ] **The number is right.** `Mobile` + `Last 7 days` grand total matches
      Android's own Settings → Network & internet → Data usage for the same
      window. If it disagrees, the UI is fine and the aggregation is not.
- [ ] **Comb check.** The dashboard chart's bars must **not** alternate
      full/empty in a regular pattern. If they do, Android's real bucket width
      on this device is wider than the 2 h floor and `MIN_BUCKET_MS` in
      `src/features/usage/bucket.ts` needs raising.
- [ ] **Bar placement.** The tallest bar lands on a period you actually used
      data. A systematic ~2 h shift means `StatsReader.kt:120-123`'s
      whole-bucket attribution needs work, and the caption's placement caveat
      becomes an Important finding rather than a Minor one.
- [ ] **Detail total equals dashboard row.** Tap an app; its total must match
      the row's, digit for digit, same range and filter.
- [ ] **Foreground + background sum to that total.**

## 2. Permission gate

- [ ] Revoke usage access (Settings → Apps → Special app access → Usage access →
      `network_tracker`), cold-start. Expect the "Usage access needed" screen —
      not the tabs, not a stuck splash.
- [ ] The copy names the exact toggle wording your Android version uses. Adjust
      if your OEM labels it differently.
- [ ] Tap "Open settings", grant, press Back. The dashboard appears **without**
      killing the app.
- [ ] Grant → background the app → revoke → foreground. The gate returns.
      (`AppState` is now the only path that does this; `useFocusEffect` was
      removed as a no-op above `<Stack>`.)

## 3. Dashboard

- [ ] Apps descend by total; the widest bar is the top row.
- [ ] `Mobile` → `Wi-Fi` changes **both** the total and the ordering. `All` ≈
      the sum of the two.
- [ ] Every range chip changes the numbers.
- [ ] A range with no traffic shows "No usage recorded in this range." — never a
      blank screen, never a crash.
- [ ] **Hidden system apps reconcile.** On a device with tethering or system
      traffic, the totals card names the hidden apps and their bytes, and
      headline − that figure = the sum of the visible rows.
- [ ] A range older than the device's retention shows the coverage note in plain
      secondary text, **not** styled as an error.
- [ ] Long app names truncate with the byte value still fully visible.
- [ ] The list scrolls under the tab bar; the last row is readable, not clipped.

## 4. Range picker

- [ ] `Custom…` opens date → time → date → time.
- [ ] The **second** date dialog opens on the day you just picked and refuses
      earlier days.
- [ ] A range wider than a year is rejected with "Range cannot be longer than a
      year." under the chips, not an empty chart.

## 5. App detail

- [ ] Header shows the app name; the card reads "Used by this app", not the
      device-level string.
- [ ] "Open in Android settings" opens **that** app's App info page — not ours,
      not the usage-access list.
- [ ] A UID with no package (enable system apps, pick e.g. UID 1021) shows the
      explanatory line and **no button**.
- [ ] Back returns to the dashboard with range and filter still selected.

## 6. Chart states

- [ ] Switching Today → Last 30 days: bars vanish into a spinner for the whole
      query. You must never see old bars under a new caption.
- [ ] An empty range shows "No usage in this range." inside a bordered panel,
      never a blank box.
- [ ] A deliberately unaligned custom range (e.g. 14:37 → 16:12): if Android
      snaps outward, the coverage sentence appears under the chart. If it never
      appears on any range, check the series result carries real
      `coveredStart`/`coveredEnd` rather than the empty-result fallback.

## 7. Presentation and accessibility

- [ ] Dark mode on every screen: bars, borders, accent fill and secondary text
      all readable. Nothing dark-on-dark.
- [ ] The deepened primary blue still reads as the product's blue, not navy.
      Unselected chips/tabs now have a visible outline that is not so strong it
      reads as a heavy box.
- [ ] Largest system font: the download/upload pair wraps rather than collides;
      the grand total shrinks rather than clips.
- [ ] TalkBack on an app row announces name, size, share, and "Opens this app's
      usage details".
- [ ] TalkBack on the chart announces bar count, bar width, total and peak —
      not "image", not silence.

## 8. Off-Android degradation

- [ ] `npx expo start --web`. Expect the "Android only" screen. A
      `Cannot find native module 'NetworkUsage'` crash means Metro is not
      resolving `modules/network-usage/index.web.ts`, which is the one
      unexecuted assumption in the Phase 2 fix wave.

---

## Follow-up, not part of this pass

**Re-run the Phase 0 Q3 granularity probe before Phase 3.** Switch to mobile
data, stream for a few minutes, then run the probe over that exact window. The
original probe ran over a window with no mobile traffic, so it proved nothing.
If sub-2-hour buckets turn out to be real, lower `MIN_BUCKET_MS` in
`src/features/usage/bucket.ts` (it carries a `ponytail:` marker naming this) and
update `docs/findings/phase-0.md` §Q3. Phase 3's projection maths will inherit
whatever granularity assumption is left unresolved here.
