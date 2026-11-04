import * as SQLite from 'expo-sqlite';

import { fetchUsage } from '@/features/usage/services/api';
import { isWifiWatchEnabled } from '@/features/usage/services/wifiNetworks';

import { openArchive, pruneArchive, snapshotDay } from './db';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('@/features/usage/services/api', () => ({ fetchUsage: jest.fn() }));
jest.mock('@/features/usage/services/wifiNetworks', () => ({
  fetchWifiNetworkUsage: jest.fn(), isWifiWatchEnabled: jest.fn(),
}));

const archive = {
  execAsync: jest.fn(async () => {}),
  getAllAsync: jest.fn(async () => [{ name: 'ssid' }]),
  runAsync: jest.fn<Promise<SQLite.SQLiteRunResult>, unknown[]>(async () => ({ changes: 0, lastInsertRowId: 0 })),
  withTransactionAsync: jest.fn(async (work: () => Promise<void>) => work()),
  withExclusiveTransactionAsync: jest.fn<Promise<void>, [(transaction: unknown) => Promise<void>]>(),
};
archive.withExclusiveTransactionAsync.mockImplementation((work) => work(archive));

it('waits for schema initialization when opened concurrently', async () => {
  let finish!: () => void;
  archive.execAsync.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(archive as unknown as SQLite.SQLiteDatabase);

  const first = openArchive();
  await Promise.resolve();
  let ready = false;
  const second = openArchive().then(() => { ready = true; });
  await Promise.resolve();
  await Promise.resolve();
  const wasReadyBeforeSchema = ready;
  finish();
  await Promise.all([first, second]);
  expect(wasReadyBeforeSchema).toBe(false);
  expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
});

it('replaces every old row when re-snapshotting without per-network tracking', async () => {
  jest.mocked(isWifiWatchEnabled).mockReturnValue(false);
  jest.mocked(fetchUsage).mockResolvedValue({
    apps: [], totals: { download: 0, upload: 0, total: 0 }, coverage: null,
  });
  archive.runAsync.mockClear();
  await snapshotDay(new Date(2026, 0, 15).getTime());
  expect(archive.runAsync.mock.calls[0]).toEqual(
    ['DELETE FROM daily_usage WHERE day_start = ?', new Date(2026, 0, 15).getTime()],
  );
  expect(archive.runAsync.mock.calls[1][0]).toBe('DELETE FROM daily_usage WHERE day_start < ?');
});

it('keeps the previous complete snapshot when the Wi-Fi query fails', async () => {
  archive.runAsync.mockClear();
  jest.mocked(fetchUsage).mockResolvedValueOnce({
    apps: [], totals: { download: 0, upload: 0, total: 0 }, coverage: null,
  }).mockRejectedValueOnce(new Error('usage query failed'));
  await expect(snapshotDay(new Date(2026, 0, 15).getTime())).rejects.toThrow('usage query failed');
  expect(archive.runAsync).not.toHaveBeenCalled();
});

it.each([[2026, 3, 24], [2026, 9, 29]])('archives a complete local day across clock changes (%i-%i-%i)', async (year, month, day) => {
  const start = new Date(year, month, day).getTime();
  await snapshotDay(start);
  expect(fetchUsage).toHaveBeenLastCalledWith(
    { start, end: new Date(year, month, day + 1).getTime(), preset: 'custom' },
    'WIFI',
  );
});

it.each([
  [2026, 10, 4, 2026, 3, 4],
  [2026, 8, 30, 2026, 1, 28],
  [2024, 8, 30, 2024, 1, 29],
  [2026, 0, 31, 2025, 5, 30],
])('prunes only days older than seven calendar months (%i-%i-%i)', async (year, month, day, oldYear, oldMonth, oldDay) => {
  archive.runAsync.mockClear();
  archive.execAsync.mockClear();
  await pruneArchive(new Date(year, month, day, 15).getTime());
  expect(archive.runAsync).toHaveBeenCalledWith(
    'DELETE FROM daily_usage WHERE day_start < ?',
    new Date(oldYear, oldMonth, oldDay).getTime(),
  );
  expect(archive.execAsync).not.toHaveBeenCalled();
});

it('reclaims disk space after expired archive rows are removed', async () => {
  archive.execAsync.mockClear();
  archive.runAsync.mockResolvedValueOnce({ changes: 12, lastInsertRowId: 0 });
  await pruneArchive();
  expect(archive.execAsync).toHaveBeenCalledWith('VACUUM;');
});
