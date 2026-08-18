import { Platform, ToastAndroid } from 'react-native';

/**
 * Transient user-facing message. Android's own toast is used rather than an
 * in-app overlay: it is the platform convention, it survives navigation, and
 * it needs no provider at the root of the tree.
 */
export function toast(message: string, long = false): void {
  if (Platform.OS !== 'android') return;
  ToastAndroid.show(message, long ? ToastAndroid.LONG : ToastAndroid.SHORT);
}
