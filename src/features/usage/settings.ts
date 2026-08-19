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
