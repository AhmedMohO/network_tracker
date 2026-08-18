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

  const reload = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    fetchSeries(range, network, bucketMs, uid)
      .then((result) => {
        if (requestIdRef.current === requestId) setData(result);
      })
      .catch((e) => {
        if (requestIdRef.current === requestId) setError(String(e?.message ?? e));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [range.start, range.end, network, bucketMs, uid]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
