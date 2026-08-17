import { useCallback, useEffect, useRef, useState } from "react";
import { fetchUsage, type NetworkFilter, type UsageResult } from "./api";
import type { Range } from "./range";

export function useUsage(range: Range, network: NetworkFilter) {
  const [data, setData] = useState<UsageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    fetchUsage(range, network)
      .then((result) => {
        if (requestIdRef.current === requestId) setData(result);
      })
      .catch((e) => {
        if (requestIdRef.current === requestId) setError(String(e?.message ?? e));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [range.start, range.end, network]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
