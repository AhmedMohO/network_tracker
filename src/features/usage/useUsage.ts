import { useCallback, useEffect, useState } from "react";
import type { NetworkFilter } from "@modules/network-usage";
import { fetchUsage, type UsageResult } from "./api";
import type { Range } from "./range";

export function useUsage(range: Range, network: NetworkFilter) {
  const [data, setData] = useState<UsageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUsage(range, network)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message ?? e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, network]);

  useEffect(() => reload(), [reload]);

  return { data, loading, error, reload };
}
