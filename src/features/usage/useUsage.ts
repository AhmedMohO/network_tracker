import { useCallback, useEffect, useRef, useState } from "react";
import { fetchUsageWithArchive } from "@/features/archive/readThrough";

import type { NetworkFilter, UsageResult } from "./api";
import type { Range } from "./range";

export function useUsage(range: Range, network: NetworkFilter) {
  const [data, setData] = useState<UsageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const reload = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    fetchUsageWithArchive(range, network)
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
  }, [range.start, range.end, network]);

  useEffect(() => {
    mountedRef.current = true;
    reload();
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  return { data, loading, error, reload };
}
