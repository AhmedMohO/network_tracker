import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useNow } from './use-now';

it('advances time without a data refresh and stops ticking after unmount', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(100_000);
  let now = 0;
  function Harness() {
    const value = useNow();
    useEffect(() => { now = value; }, [value]);
    return null;
  }
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => { renderer = create(<Harness />); });
    expect(now).toBe(100_000);
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(now).toBe(160_000);
    await act(async () => { renderer.unmount(); });
    await act(async () => { jest.advanceTimersByTime(60_000); });
    expect(now).toBe(160_000);
  } finally {
    jest.useRealTimers();
  }
});
