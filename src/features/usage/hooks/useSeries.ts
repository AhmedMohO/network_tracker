import type { SeriesResult } from "@modules/network-usage";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchSeries, type NetworkFilter } from "../services/api";
import type { Range } from "../utils/range";

export function useSeries(
  { start, end, preset }: Range,
  network: NetworkFilter,
  bucketMs: number,
  uid?: number
) {
  const query = useMemo(
    () => ({ range: { start, end, preset }, network, bucketMs, uid }),
    [start, end, preset, network, bucketMs, uid]
  );
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    query: typeof query;
    version: number;
    data: SeriesResult | null;
    error: string | null;
  } | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    fetchSeries(query.range, query.network, query.bucketMs, query.uid)
      .then((data) => {
        if (active) setResult({ query, version, data, error: null });
      })
      .catch((error) => {
        if (active) setResult({ query, version, data: null, error: String(error?.message ?? error) });
      });
    return () => { active = false; };
  }, [query, version]);

  const current = result?.query === query && result.version === version;
  return {
    data: current ? result.data : null,
    loading: !current,
    error: current ? result.error : null,
    reload,
  };
}
