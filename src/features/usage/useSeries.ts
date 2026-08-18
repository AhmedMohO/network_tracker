import type { SeriesResult } from "@modules/network-usage";
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSeries, type NetworkFilter } from "./api";
import type { Range } from "./range";

/**
 * Time series for the chart. Mirrors `useUsage`, including the request-id
 * guard that drops a slow response once a newer range has been asked for.
 */
export function useSeries(
  range: Range,
  network: NetworkFilter,
  bucketMs: number,
  uid?: number
) {
  const [data, setData] = useState<SeriesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const reload = useCallback(() => {
    const requestId = ++requestIdRef.current;
    // The caption and coverage note are recomputed from the *current* range on
    // every render, so keeping the old bins on screen would describe them with
    // the new range's bin width. Drop them and show the spinner instead.
    setData(null);
    setLoading(true);
    setError(null);
    fetchSeries(range, network, bucketMs, uid)
      .then((result) => {
        if (isCurrent(requestId)) setData(result);
      })
      .catch((e) => {
        if (isCurrent(requestId)) setError(String(e?.message ?? e));
      })
      .finally(() => {
        if (isCurrent(requestId)) setLoading(false);
      });

    function isCurrent(id: number) {
      return mountedRef.current && requestIdRef.current === id;
    }
  }, [range.start, range.end, network, bucketMs, uid]);

  useEffect(() => {
    mountedRef.current = true;
    reload();
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  return { data, loading, error, reload };
}
