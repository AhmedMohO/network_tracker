import Storage from 'expo-sqlite/kv-store';

import { loadSettings, saveSettings } from './settings';

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItemSync: jest.fn() },
}));

let stored: string | null;

beforeEach(() => {
  stored = null;
  jest.mocked(Storage.getItem).mockImplementation(async () => stored);
  jest.mocked(Storage.setItemSync).mockImplementation((_key, value) => {
    stored = typeof value === 'function' ? value(stored) : value;
  });
});

it('preserves independent settings saved at the same time', async () => {
  await Promise.all([
    saveSettings({ mobileLimitBytes: 1024 }),
    saveSettings({ deviceLabel: 'Phone' }),
    saveSettings({ lastSyncOkAt: 123 }),
  ]);

  expect(await loadSettings()).toMatchObject({
    mobileLimitBytes: 1024, deviceLabel: 'Phone', lastSyncOkAt: 123,
  });
});

it('allows saving again after a storage failure', async () => {
  jest.mocked(Storage.setItemSync).mockImplementationOnce(() => { throw new Error('disk full'); });
  await expect(saveSettings({ deviceLabel: 'Lost' })).rejects.toThrow('disk full');
  await saveSettings({ deviceLabel: 'Saved' });
  expect((await loadSettings()).deviceLabel).toBe('Saved');
});
