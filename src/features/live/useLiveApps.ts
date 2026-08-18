import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { AppUsage } from '@/features/usage/aggregate';
import { fetchUsage } from '@/features/usage/api';

/** More than this and the list stops being a glance. */
const MAX_ROWS = 8;

/**
 * Recent per-app bytes, re-queried on an interval while the screen is focused.
 *
 * This is "bytes attributed to this app in the last `windowMs`", **not** a
 * per-app rate — Android exposes no live per-app throughput. Phase 0 Q4 proved
 * a 10-second trailing window at a 2-second cadence returns real, moving rows;
 * the UI must say exactly that and never format these as a speed.
 */
export function useLiveApps(windowMs: number, intervalMs: number): AppUsage[] {
  const [apps, setApps] = useState<AppUsage[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let inFlight = false;

      const tick = async () => {
        // A query slower than the interval must not pile up behind itself.
        if (inFlight) return;
        inFlight = true;
        const now = Date.now();
        try {
          const { apps: rows } = await fetchUsage(
            { start: now - windowMs, end: now, preset: 'custom' },
            'ALL'
          );
          if (!cancelled) setApps(rows.filter((a) => a.total > 0).slice(0, MAX_ROWS));
        } catch {
          // A failed poll is not worth surfacing; the next one will retry.
        } finally {
          inFlight = false;
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
