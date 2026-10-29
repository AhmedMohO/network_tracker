import { useEffect, useState } from "react";

import { fetchAppIcon } from "../services/api";

/**
 * Launcher icons cannot change while the app is running, and the same rows are
 * re-rendered on every range and filter change, so one lookup per package per
 * session is enough. Misses are cached too.
 */
const cache = new Map<string, string | null>();

export function useAppIcon(packageName: string | null): string | null {
  const [icon, setIcon] = useState<{ packageName: string; uri: string | null } | null>(null);

  useEffect(() => {
    if (!packageName || cache.has(packageName)) return;

    let alive = true;
    fetchAppIcon(packageName)
      .then((base64) => {
        const value = base64 ? `data:image/png;base64,${base64}` : null;
        cache.set(packageName, value);
        if (alive) setIcon({ packageName, uri: value });
      })
      // An icon is decoration; a failed lookup must not surface as an error.
      .catch(() => cache.set(packageName, null));

    return () => {
      alive = false;
    };
  }, [packageName]);

  return packageName ? cache.get(packageName) ?? (icon?.packageName === packageName ? icon.uri : null) : null;
}
