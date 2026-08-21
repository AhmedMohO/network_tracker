import { useCallback, useEffect, useRef, useState } from "react";

import { fetchWifiNetworksWithArchive } from "@/features/archive/readThrough";

import type { Range } from "./range";
import { isWifiWatchEnabled, type WifiNetworkResult } from "./wifiNetworks";

/**
 * The Wi-Fi split for a range, or `null` when the user has not turned
 * per-network tracking on.
 *
 * Deliberately not folded into `useUsage`: the per-network query is a separate
 * native pass, and the dashboard shows it only for Wi-Fi and All. Running it
 * from `useUsage` would cost every Mobile-only view a query for an answer that
 * view never renders.
 */
export function useWifiNetworks(range: Range, enabled = true) {
  const [data, setData] = useState<WifiNetworkResult | null>(null);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const reload = useCallback(() => {
    if (!enabled || !isWifiWatchEnabled()) {
      setData(null);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    fetchWifiNetworksWithArchive(range)
      .then((result) => {
        if (isCurrent(requestId)) setData(result);
      })
      .catch(() => {
        // A missing split is a missing card, not an error banner: the totals
        // this sits under came from a query that already succeeded, and the
        // screen is still correct without it.
        if (isCurrent(requestId)) setData(null);
      })
      .finally(() => {
        if (isCurrent(requestId)) setLoading(false);
      });

    function isCurrent(id: number) {
      return mountedRef.current && requestIdRef.current === id;
    }
  }, [range.start, range.end, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    reload();
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  return { data, loading, reload };
}
