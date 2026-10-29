import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchUsageWithArchive } from "@/features/archive/services/readThrough";

import type { NetworkFilter, UsageResult } from "../services/api";
import type { Range } from "../utils/range";

export function useUsage({ start, end, preset }: Range, network: NetworkFilter) {
  const query = useMemo(() => ({ range: { start, end, preset }, network }), [start, end, preset, network]);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    query: typeof query;
    version: number;
    data: UsageResult | null;
    error: string | null;
  } | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    fetchUsageWithArchive(query.range, query.network)
      .then((data) => {
        if (active) setResult({ query, version, data, error: null });
      })
      .catch((error) => {
        if (active) setResult((current) => ({
          query, version,
          data: current?.query === query ? current.data : null,
          error: String(error?.message ?? error),
        }));
      });
    return () => { active = false; };
  }, [query, version]);

  const current = result?.query === query;
  return {
    data: current ? result.data : null,
    loading: !current || result.version !== version,
    error: current && result.version === version ? result.error : null,
    reload,
  };
}
