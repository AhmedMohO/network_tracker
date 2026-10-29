import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { NetworkFilter } from '@modules/network-usage';
import { useNow } from '@/hooks/use-now';

import { presetRange, type Range } from '../utils/range';
import { loadSettings, type Settings } from '../services/settings';

type Ctx = {
  range: Range;
  setRange: (r: Range) => void;
  network: NetworkFilter;
  setNetwork: (n: NetworkFilter) => void;
  settings: Settings | null;
  reloadSettings: () => void;
};

const UsageContext = createContext<Ctx | null>(null);

export function UsageProvider({ children }: { children: ReactNode }) {
  const [selectedRange, setRange] = useState<Range>(() => presetRange('today', Date.now()));
  // Mobile is the default because that is the number that costs money.
  const [network, setNetwork] = useState<NetworkFilter>('MOBILE');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tick, setTick] = useState(0);
  const now = useNow();
  const range = useMemo(() => selectedRange.preset === 'custom'
    ? selectedRange
    : presetRange(selectedRange.preset, Math.max(now, selectedRange.end), settings?.cycleStartDay ?? 1),
  [selectedRange, now, settings?.cycleStartDay]);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, [tick]);

  const value = useMemo(
    () => ({
      range,
      setRange,
      network,
      setNetwork,
      settings,
      reloadSettings: () => setTick((t) => t + 1),
    }),
    [range, network, settings]
  );

  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
}

export function useUsageContext(): Ctx {
  const ctx = useContext(UsageContext);
  if (!ctx) throw new Error('useUsageContext must be used inside UsageProvider');
  return ctx;
}
