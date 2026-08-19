import Storage from "expo-sqlite/kv-store";

export type Settings = {
  /** Shared by both networks: the dashboard's cycle presets read it too. */
  cycleStartDay: number;
  mobileLimitBytes: number | null;
  mobileWarnAtPercent: number;
  wifiLimitBytes: number | null;
  wifiWarnAtPercent: number;
  showSystemApps: boolean;
  /** Alert keys already fired and still live; see `features/limits/alerts`. */
  alertedKeys: string[];
  /** null until this install joins a pair. See `features/family/pair`. */
  familyRole: "parent" | "child" | null;
  pairToken: string | null;
  deviceId: string | null;
  deviceLabel: string | null;
  /** The label of the device that minted the link this device joined with. Child-only; set by `joinAsChild`. */
  pairedLabel: string | null;
  /** Set by `features/family/sync`'s `syncRun` when a whole sync run succeeds. */
  lastSyncOkAt: number | null;
  /** Set on the first failure of a run of failures; cleared once a full run succeeds. */
  lastSyncErrorAt: number | null;
  /** The `lastSyncErrorAt` value already notified about; see `backgroundCheck`. */
  syncErrorNotifiedAt: number | null;
  /**
   * A parent's per-child notification limits, keyed by the child's `deviceId`.
   * `mobileLimitBytes` names it for parity with this device's own limit
   * fields, but `backgroundCheck.ts`'s `childCycleUsedBytes` compares it
   * against the child's total (mobile + Wi-Fi) usage — a child's `daily`
   * archive push never splits by network, so a mobile-only figure cannot be
   * reconstructed for a past day without fabricating precision it never had.
   */
  childLimits: Record<string, { mobileLimitBytes: number | null; warnAtPercent: number }>;
  /** Per-child one-shot record for the 24-hour quiet notice; see `decideQuietChild`. */
  childQuietNotifiedAt: Record<string, number>;
  /**
   * Child-only resume cursor for `backfillFromChild`: the oldest day already
   * pushed, or `null` when the backfill has never run. A boolean "done" flag
   * would be a lie for the common case — the backfill is minutes of native
   * queries and routinely outlives the JS context that started it.
   */
  backfillDoneUntil: number | null;
};

const KEY = "settings.v1";

const DEFAULTS: Settings = {
  cycleStartDay: 1,
  mobileLimitBytes: null,
  mobileWarnAtPercent: 80,
  wifiLimitBytes: null,
  wifiWarnAtPercent: 80,
  showSystemApps: false,
  alertedKeys: [],
  familyRole: null,
  pairToken: null,
  deviceId: null,
  deviceLabel: null,
  pairedLabel: null,
  lastSyncOkAt: null,
  lastSyncErrorAt: null,
  syncErrorNotifiedAt: null,
  childLimits: {},
  childQuietNotifiedAt: {},
  backfillDoneUntil: null,
};

export async function loadSettings(): Promise<Settings> {
  const raw = await Storage.getItem(KEY);
  if (!raw) return DEFAULTS;
  try {
    const stored = JSON.parse(raw);
    // Before Wi-Fi had a limit of its own, the mobile warn threshold was
    // stored unprefixed. Carry it forward so an upgrade keeps the user's
    // setting instead of silently resetting it to 80.
    if (typeof stored.warnAtPercent === "number") {
      stored.mobileWarnAtPercent ??= stored.warnAtPercent;
      delete stored.warnAtPercent;
    }
    return { ...DEFAULTS, ...stored };
  } catch {
    // Corrupt value is not worth crashing over; fall back to defaults.
    return DEFAULTS;
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await Storage.setItem(KEY, JSON.stringify(next));
  return next;
}
