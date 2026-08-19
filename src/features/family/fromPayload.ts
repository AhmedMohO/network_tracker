import type { AppUsage } from "@/features/usage/aggregate";

/** Shape `dailyPayload`/`recentPayload` (in `./sync`) write to the wire. */
type WirePayload = {
  apps: { uid: number; name: string; pkg: string | null; dl: number; ul: number }[];
  otherBytes: number;
};

/**
 * A UID Android never assigns (app UIDs start at `FIRST_APP_UID` = 10000;
 * platform UIDs are >= 0), so the synthetic "other apps" row can never
 * collide with a real one.
 */
const OTHER_UID = -100;

/**
 * Inverse of `dailyPayload`: turns a synced payload back into the
 * `AppUsage[]` shape `TotalsCard`, `AppRow` and `UsageChart` already render.
 *
 * Percentages divide by the grand total *including* `otherBytes` — dividing
 * by the visible rows only would quietly inflate every percentage on the
 * parent's screen. The trimmed tail becomes its own row (a synthetic UID
 * rather than being hidden), so the parent's total still accounts for every
 * byte the child measured. No foreground/background split is reported,
 * for the same reason `readArchive` reports none: the payload does not
 * carry it, and inventing one would be worse than reporting nothing.
 *
 * `otherAppsLabel` is the translated name for the trimmed-tail row, supplied
 * by the caller — same reason `toAppUsage` in `features/usage/aggregate`
 * takes an `unknown`/`rename` callback instead of importing `@/i18n`
 * directly: that pulls in `expo-sqlite/kv-store` at module scope (see
 * `src/i18n/index.ts`'s `Storage.getItemSync`), which jest-expo does not
 * stub, and would crash this module's own unmocked unit tests.
 */
export function fromPayload(
  payload: WirePayload | null | undefined,
  otherAppsLabel = "Other apps"
): AppUsage[] {
  const apps = payload?.apps;
  if (!Array.isArray(apps)) return [];

  const otherBytes = payload?.otherBytes ?? 0;
  const grandTotal = apps.reduce((sum, a) => sum + a.dl + a.ul, 0) + otherBytes;
  const percentage = (total: number) => (grandTotal === 0 ? 0 : (total / grandTotal) * 100);

  const rows: AppUsage[] = apps.map((a) => {
    const total = a.dl + a.ul;
    return {
      uid: a.uid,
      name: a.name,
      packageName: a.pkg,
      download: a.dl,
      upload: a.ul,
      total,
      foreground: 0,
      background: 0,
      percentage: percentage(total),
    };
  });

  if (otherBytes > 0) {
    rows.push({
      uid: OTHER_UID,
      name: otherAppsLabel,
      packageName: null,
      // The trimmed tail's own download/upload split is not on the wire —
      // only its combined total is. Reporting a fabricated split would be
      // worse than reporting none.
      download: 0,
      upload: 0,
      total: otherBytes,
      foreground: 0,
      background: 0,
      percentage: percentage(otherBytes),
    });
  }

  return rows;
}
