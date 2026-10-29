import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { UsageProvider, useUsageContext } from './useUsageContext';

jest.mock('../services/settings', () => ({ loadSettings: jest.fn(async () => ({ cycleStartDay: 15 })) }));

it('advances Today across midnight while leaving an explicit custom range fixed', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 0, 15, 23, 59, 30));
  let latest!: ReturnType<typeof useUsageContext>;
  function Harness() {
    const value = useUsageContext();
    useEffect(() => { latest = value; });
    return null;
  }
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(<UsageProvider><Harness /></UsageProvider>); });
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(latest.range).toEqual({
      start: new Date(2026, 0, 16).getTime(),
      end: new Date(2026, 0, 16, 0, 0, 30).getTime(),
      preset: 'today',
    });
    const custom = { start: 10, end: 20, preset: 'custom' as const };
    await act(async () => { latest.setRange(custom); });
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(latest.range).toEqual(custom);
  } finally {
    await act(async () => { renderer?.unmount(); });
    jest.useRealTimers();
  }
});
