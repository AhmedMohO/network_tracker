import { useEffect, useState } from "react";

import { fetchAppIcon } from "./api";

/**
 * Launcher icons cannot change while the app is running, and the same rows are
 * re-rendered on every range and filter change, so one lookup per package per
 * session is enough. Misses are cached too.
 */
const cache = new Map<string, string | null>();

export function useAppIcon(packageName: string | null): string | null {
  const [uri, setUri] = useState<string | null>(() =>
    packageName ? cache.get(packageName) ?? null : null
  );

  useEffect(() => {
    if (!packageName) return setUri(null);
    if (cache.has(packageName)) return setUri(cache.get(packageName) ?? null);

    let alive = true;
    fetchAppIcon(packageName)
      .then((base64) => {
        const value = base64 ? `data:image/png;base64,${base64}` : null;
        cache.set(packageName, value);
        if (alive) setUri(value);
      })
      // An icon is decoration; a failed lookup must not surface as an error.
      .catch(() => cache.set(packageName, null));

    return () => {
      alive = false;
    };
  }, [packageName]);

  return uri;
}
