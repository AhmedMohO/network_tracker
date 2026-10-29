import * as TaskManager from 'expo-task-manager';
import { main } from './package.json';

jest.mock('expo-router/entry', () => ({}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-background-task', () => ({}));
jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('./src/features/archive/services/db', () => ({}));
jest.mock('./src/features/family/services/cache', () => ({}));
jest.mock('./src/features/family/services/sync', () => ({}));
jest.mock('./src/features/family/hooks/useFamily', () => ({}));
jest.mock('./src/features/usage/services/api', () => ({}));
jest.mock('./src/features/usage/services/settings', () => ({}));
jest.mock('./src/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

it('registers background jobs from the app entry without mounting any screen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Bootstrap the configured entry in Jest's CommonJS runtime.
  require(main);
  expect(TaskManager.defineTask).toHaveBeenCalledWith('usage-threshold-check', expect.any(Function));
  expect(TaskManager.defineTask).toHaveBeenCalledWith('family-push-sync', expect.any(Function));
});
