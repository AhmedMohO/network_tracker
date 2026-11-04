import * as Application from 'expo-application';
import { File } from 'expo-file-system';

import { removeInstalledApk } from './cleanup';

jest.mock('expo-application', () => ({ getLastUpdateTimeAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: 'cache' } }));

const file = { exists: true, info: jest.fn(), delete: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  file.exists = true;
  file.info.mockReturnValue({ modificationTime: 1000 });
  jest.mocked(File).mockImplementation(() => file as unknown as File);
  jest.mocked(Application.getLastUpdateTimeAsync).mockResolvedValue(new Date(2000));
});

it('removes an installer downloaded before the installed app was updated', async () => {
  await removeInstalledApk();
  expect(File).toHaveBeenCalledWith('cache', 'update.apk');
  expect(file.delete).toHaveBeenCalledTimes(1);
});

it('keeps an installer that may still be waiting for installation', async () => {
  file.info.mockReturnValue({ modificationTime: 3000 });
  await removeInstalledApk();
  expect(file.delete).not.toHaveBeenCalled();
});

it('does nothing when there is no cached installer', async () => {
  file.exists = false;
  await removeInstalledApk();
  expect(Application.getLastUpdateTimeAsync).not.toHaveBeenCalled();
  expect(file.delete).not.toHaveBeenCalled();
});

it('keeps the file when its age is unknown', async () => {
  file.info.mockReturnValue({});
  await removeInstalledApk();
  expect(file.delete).not.toHaveBeenCalled();
});

it('propagates a filesystem error for the startup caller to handle', async () => {
  file.delete.mockImplementationOnce(() => { throw new Error('read-only'); });
  await expect(removeInstalledApk()).rejects.toThrow('read-only');
});
