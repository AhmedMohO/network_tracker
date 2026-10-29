import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchWifiNetworksWithArchive } from "@/features/archive/services/readThrough";

import type { Range } from "../utils/range";
import { isWifiWatchEnabled, type WifiNetworkResult } from "../services/wifiNetworks";

/** The optional Wi-Fi split is queried only when the screen can display it. */
export function useWifiNetworks({ start, end, preset }: Range, enabled = true) {
  const query = useMemo(() => ({ start, end, preset }), [start, end, preset]);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{
    query: typeof query;
    version: number;
    data: WifiNetworkResult | null;
  } | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    const pending = enabled && isWifiWatchEnabled()
      ? fetchWifiNetworksWithArchive(query)
      : Promise.resolve(null);
    pending
      .catch(() => null)
      .then((data) => {
        if (active) setResult({ query, version, data });
      });
    return () => { active = false; };
  }, [query, enabled, version]);

  const current = result?.query === query && result.version === version;
  return {
    data: enabled && current ? result.data : null,
    loading: enabled && !current,
    reload,
  };
}
