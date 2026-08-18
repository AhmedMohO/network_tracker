/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { I18nManager, Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    // Darkened from the #208AEF brand blue so white-on-accent and
    // accent-on-surface both clear WCAG AA (4.5:1) for 14-16px text.
    accent: '#1268B5',
    accentMuted: '#1268B51F',
    accentForeground: '#ffffff',
    // >= 3:1 against both `background` and `backgroundElement`, so an
    // unselected chip or tab outline reads as a real affordance.
    border: '#828892',
    danger: '#B3261E',
    // Second series colour: far enough from the blue accent in hue and
    // lightness to stay distinguishable, including for red-green deficiency.
    accentAlt: '#7A4CC4',
    // Amber alert tone, distinct from both `accent` (blue) and `danger`
    // (red) by hue alone. >= 4.5:1 against `background` and `backgroundElement`.
    warning: '#946200',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    accent: '#5CA9F5',
    accentMuted: '#5CA9F52E',
    accentForeground: '#04101C',
    border: '#6A6F78',
    danger: '#FF8A80',
    accentAlt: '#C4A2F5',
    warning: '#E8A200',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** `textAlign` value that hugs the end of the line in either direction. */
export const TextEnd = I18nManager.isRTL ? 'left' : 'right';

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
