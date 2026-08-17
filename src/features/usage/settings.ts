import Storage from "expo-sqlite/kv-store";

export type Settings = {
  cycleStartDay: number;
  mobileLimitBytes: number | null;
  warnAtPercent: number;
  showSystemApps: boolean;
};

const KEY = "settings.v1";

const DEFAULTS: Settings = {
  cycleStartDay: 1,
  mobileLimitBytes: null,
  warnAtPercent: 80,
  showSystemApps: false,
};

export async function loadSettings(): Promise<Settings> {
  const raw = await Storage.getItem(KEY);
  if (!raw) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
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
