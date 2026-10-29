import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { fetchUsageWithArchive, fetchWifiNetworksWithArchive } from '@/features/archive/services/readThrough';

import { useUsage } from './useUsage';
import { useAppIcon } from './useAppIcon';
import { useWifiNetworks } from './useWifiNetworks';
import type { NetworkFilter } from '../services/api';
import { fetchAppIcon } from '../services/api';
import { isWifiWatchEnabled } from '../services/wifiNetworks';

jest.mock('@/features/archive/services/readThrough', () => ({
  fetchUsageWithArchive: jest.fn(), fetchWifiNetworksWithArchive: jest.fn(),
}));
jest.mock('../services/wifiNetworks', () => ({ isWifiWatchEnabled: jest.fn() }));
jest.mock('../services/api', () => ({ fetchAppIcon: jest.fn(), fetchSeries: jest.fn() }));

const range = { start: 1, end: 2, preset: 'custom' as const };
const usage = { apps: [], totals: { download: 10, upload: 0, total: 10 }, coverage: null };
let renderer: ReactTestRenderer;

afterEach(async () => {
  await act(async () => renderer?.unmount());
});

it('hides the previous network totals while loading a different network', async () => {
  jest.mocked(fetchUsageWithArchive).mockResolvedValueOnce(usage).mockImplementationOnce(() => new Promise(() => {}));
  let latest!: ReturnType<typeof useUsage>;
  function Harness({ network }: { network: NetworkFilter }) {
    const value = useUsage(range, network);
    useEffect(() => { latest = value; });
    return null;
  }
  await act(async () => { renderer = create(<Harness network="MOBILE" />); });
  expect(latest.data).toEqual(usage);
  await act(async () => { renderer.update(<Harness network="WIFI" />); });
  expect(latest.loading).toBe(true);
  expect(latest.data).toBeNull();
});

it('does not restore an in-flight Wi-Fi response after the card is disabled', async () => {
  jest.mocked(isWifiWatchEnabled).mockReturnValue(true);
  let finish!: (value: { networks: []; coverage: null }) => void;
  jest.mocked(fetchWifiNetworksWithArchive).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let latest!: ReturnType<typeof useWifiNetworks>;
  function Harness({ enabled }: { enabled: boolean }) {
    const value = useWifiNetworks(range, enabled);
    useEffect(() => { latest = value; });
    return null;
  }
  await act(async () => { renderer = create(<Harness enabled />); });
  await act(async () => { renderer.update(<Harness enabled={false} />); });
  await act(async () => { finish({ networks: [], coverage: null }); });
  expect(latest.data).toBeNull();
  expect(latest.loading).toBe(false);
});

it('does not show the previous app icon while the next icon is loading', async () => {
  jest.mocked(fetchAppIcon).mockResolvedValueOnce('first').mockImplementationOnce(() => new Promise(() => {}));
  let latest: string | null = null;
  function Harness({ pkg }: { pkg: string }) {
    const value = useAppIcon(pkg);
    useEffect(() => { latest = value; });
    return null;
  }
  await act(async () => { renderer = create(<Harness pkg="com.first" />); });
  expect(latest).toBe('data:image/png;base64,first');
  await act(async () => { renderer.update(<Harness pkg="com.second" />); });
  expect(latest).toBeNull();
});
