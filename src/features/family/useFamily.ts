import * as Device from "expo-device";
import { useCallback, useState } from "react";

import { loadSettings, saveSettings, type Settings } from "@/features/usage/settings";
import { useUsageContext } from "@/features/usage/useUsageContext";
import i18n from "@/i18n";

import { newDeviceId, newPairToken } from "./pair";
import {
  backfillFromChild,
  forgetPair,
  refreshCache,
  syncFromChild,
  type Snapshot,
} from "./sync";

/**
 * `Device.deviceName` is unset on some emulators and locked-down builds, so
 * this is a fallback, not the only source — the settings field itself is
 * always user-editable.
 */
export function defaultDeviceLabel(): string {
  return Device.deviceName ?? i18n.t("family.defaultDeviceLabel");
}

/**
 * `_layout.tsx`'s deep-link handler runs above `UsageProvider` in the tree,
 * so it cannot call a hook. These three transitions are plain functions for
 * that reason; `useFamily` below wraps them for every other caller.
 */

/**
 * Idempotent: re-calling on an already-paired parent must not mint a new
 * token, or every child holding the old link (and the rows on the server
 * keyed by that token) would silently orphan.
 */
export async function becomeParent(label: string): Promise<Settings> {
  const s = await loadSettings();
  if (s.familyRole === "parent" && s.pairToken) return s;
  return saveSettings({
    familyRole: "parent",
    pairToken: newPairToken(),
    deviceId: newDeviceId(),
    deviceLabel: label,
  });
}

/**
 * Idempotent for the exact same link: a second tap of a link this device is
 * already paired with must not mint a second device id or re-run the join.
 * Checked here, not just in the UI, so every caller gets the guarantee.
 *
 * A *different* token is refused outright rather than switched to: silently
 * abandoning the old token strands its rows with no client left holding it
 * to call `family_forget`, and if this device was itself a parent, silently
 * demotes it to a child while its own children keep pushing to a token no
 * device reads anymore. The guard lives here, not in each caller, so the
 * deep-link handler and the settings paste field both inherit it.
 */
export async function joinAsChild(token: string, parentLabel: string): Promise<Settings> {
  const s = await loadSettings();
  if (s.pairToken === token) return s;
  if (s.pairToken) throw new Error(i18n.t("family.alreadyPairedError"));
  return saveSettings({
    familyRole: "child",
    pairToken: token,
    deviceId: newDeviceId(),
    pairedLabel: parentLabel,
    deviceLabel: s.deviceLabel ?? defaultDeviceLabel(),
  });
}

/**
 * Deletes server-side first. Clearing locally before the RPC succeeds would
 * strand the rows with no client left holding the token to delete them, and
 * would tell the user their data is gone when it is not — so a thrown error
 * here reaches the caller with local state untouched, for a retry.
 */
export async function unpair(): Promise<void> {
  const s = await loadSettings();
  if (!s.pairToken) return;
  await forgetPair(s.pairToken);
  await saveSettings({
    familyRole: null,
    pairToken: null,
    deviceId: null,
    deviceLabel: null,
    pairedLabel: null,
    // These three describe the *sync run's* health, not this device's own
    // usage — leaving them set would let a stale "Family sharing has
    // stopped" banner or notification fire on a device with no family left
    // to sync with.
    lastSyncOkAt: null,
    lastSyncErrorAt: null,
    syncErrorNotifiedAt: null,
    // Pairing again means a new token and an empty server side, so the next
    // child role has to backfill from scratch rather than inherit a cursor
    // saying the history is already up there.
    backfillDoneUntil: null,
  });
}

export type ChildSummary = { deviceId: string; label: string; lastSeen: number };

/**
 * One row per device that has ever pushed under this token, keeping only its
 * most recent snapshot. Pure so it is testable without the network.
 */
export function summarizeChildren(snapshots: Snapshot[]): ChildSummary[] {
  const byDevice = new Map<string, ChildSummary>();
  for (const snap of snapshots) {
    const existing = byDevice.get(snap.deviceId);
    if (!existing || snap.updatedAt > existing.lastSeen) {
      byDevice.set(snap.deviceId, {
        deviceId: snap.deviceId,
        label: snap.deviceLabel || snap.deviceId,
        lastSeen: snap.updatedAt,
      });
    }
  }
  return Array.from(byDevice.values()).sort((a, b) => b.lastSeen - a.lastSeen);
}

/**
 * Thin hook over `settings.ts` — no state of its own beyond what the shared
 * `UsageProvider` already holds, so a change made from one screen (e.g.
 * pairing in Settings) is visible immediately on another (the banner on the
 * home tab), the same way every other settings write already propagates.
 * Makes no network call of its own — see `useChildren` (features/family) for
 * the parent-side screens that need to pull.
 */
export function useFamily() {
  const { settings, reloadSettings } = useUsageContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = settings?.familyRole ?? null;
  const token = settings?.pairToken ?? null;

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        reloadSettings();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [reloadSettings]
  );

  return {
    role,
    token,
    deviceLabel: settings?.deviceLabel ?? null,
    pairedLabel: settings?.pairedLabel ?? null,
    busy,
    error,
    becomeParent: (label: string) =>
      run(async () => {
        await becomeParent(label);
        // Warm the cache immediately so the Family tab has data if a child
        // has already paired and pushed.
        try { await refreshCache(); } catch { /* best-effort */ }
      }),
    joinAsChild: (t: string, label: string) =>
      run(async () => {
        await joinAsChild(t, label);
        // Push this child's data immediately so the parent sees it without
        // waiting for the 15-minute background task.
        try { await syncFromChild(Date.now()); } catch { /* best-effort */ }
        // Backfill historical days in the background — non-blocking so the
        // UI stays responsive.
        backfillFromChild(Date.now()).catch(() => {});
      }),
    unpair: () => run(() => unpair()),
    setDeviceLabel: (label: string) => run(() => saveSettings({ deviceLabel: label })),
  };
}
