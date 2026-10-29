import * as Notifications from 'expo-notifications';

import { notify } from './notify';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  getNotificationChannelAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { NONE: 0, DEFAULT: 3 },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

beforeEach(() => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true } as any);
  jest.mocked(Notifications.scheduleNotificationAsync).mockReset().mockResolvedValue('alert');
  jest.mocked(Notifications.getNotificationChannelAsync).mockResolvedValue({ importance: 3 } as any);
});

it('reuses an alert identifier so a retry replaces the existing notification', async () => {
  await notify('Limit reached', '10 GB used', 'mobile:over:cycle');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    identifier: 'mobile:over:cycle',
  }));
});

it('does not report a notification as posted when permission was denied', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as any);
  await expect(notify('Limit reached', '10 GB used')).resolves.toBe(false);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('does not consume an alert while only its Android channel is blocked', async () => {
  jest.mocked(Notifications.getNotificationChannelAsync).mockResolvedValue({ importance: Notifications.AndroidImportance.NONE } as any);
  await expect(notify('Limit reached', '10 GB used')).resolves.toBe(false);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('does not show a banner or tray entry for a data-only wake-up push', async () => {
  const handler = jest.mocked(Notifications.setNotificationHandler).mock.calls[0][0]!;
  expect(await handler.handleNotification({ request: { content: { title: null, body: null } } } as any))
    .toMatchObject({ shouldShowBanner: false, shouldShowList: false });
});
