/**
 * Below are the colors and design tokens that are used in the app, tailored
 * for a sleek, modern Shadcn UI theme in both light and dark modes.
 */

import '@/global.css';

import { I18nManager, Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#090A0C',
    textSecondary: '#64748B',
    background: '#F8FAFC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F1F5F9',

    // Shadcn Semantic Tokens
    card: '#FFFFFF',
    cardForeground: '#090A0C',
    popover: '#FFFFFF',
    popoverForeground: '#090A0C',

    primary: '#0284C7',
    primaryForeground: '#FFFFFF',

    secondary: '#F1F5F9',
    secondaryForeground: '#0F172A',

    muted: '#F8FAFC',
    mutedForeground: '#64748B',

    accent: '#0284C7',
    accentMuted: 'rgba(2, 132, 199, 0.12)',
    accentForeground: '#FFFFFF',
    accentAlt: '#7C3AED',
    accentAltMuted: 'rgba(124, 58, 237, 0.12)',

    border: '#E2E8F0',
    borderSubtle: '#F1F5F9',
    input: '#E2E8F0',
    ring: '#0284C7',

    danger: '#EF4444',
    destructive: '#EF4444',
    destructiveForeground: '#FFFFFF',

    warning: '#D97706',
    warningMuted: 'rgba(217, 119, 6, 0.12)',
    warningForeground: '#FFFFFF',

    success: '#10B981',
    successMuted: 'rgba(16, 185, 129, 0.12)',
    successForeground: '#FFFFFF',

    chart1: '#0284C7',
    chart2: '#7C3AED',
    chart3: '#10B981',
    chart4: '#F59E0B',
  },
  dark: {
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    background: '#090D16',
    backgroundElement: '#111726',
    backgroundSelected: '#1E293B',

    // Shadcn Semantic Tokens
    card: '#111726',
    cardForeground: '#F8FAFC',
    popover: '#111726',
    popoverForeground: '#F8FAFC',

    primary: '#38BDF8',
    primaryForeground: '#082F49',

    secondary: '#1E293B',
    secondaryForeground: '#F8FAFC',

    muted: '#151D2E',
    mutedForeground: '#94A3B8',

    accent: '#38BDF8',
    accentMuted: 'rgba(56, 189, 248, 0.16)',
    accentForeground: '#082F49',
    accentAlt: '#A78BFA',
    accentAltMuted: 'rgba(167, 139, 250, 0.16)',

    border: '#1E293B',
    borderSubtle: '#151D2E',
    input: '#1E293B',
    ring: '#38BDF8',

    danger: '#F87171',
    destructive: '#F87171',
    destructiveForeground: '#090D16',

    warning: '#FBBF24',
    warningMuted: 'rgba(251, 191, 36, 0.16)',
    warningForeground: '#090D16',

    success: '#34D399',
    successMuted: 'rgba(52, 211, 153, 0.16)',
    successForeground: '#090D16',

    chart1: '#38BDF8',
    chart2: '#A78BFA',
    chart3: '#34D399',
    chart4: '#FBBF24',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
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

export const Radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 24,
  full: 9999,
} as const;

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;

/** `textAlign` value that hugs the end of the line in either direction. */
export const TextEnd = I18nManager.isRTL ? 'left' : 'right';

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
