import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'outline'
  | 'success'
  | 'warning'
  | 'accent';

export interface BadgeProps extends ViewProps {
  variant?: BadgeVariant;
  label?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function Badge({
  variant = 'default',
  label,
  icon,
  style,
  children,
  ...props
}: BadgeProps) {
  const theme = useTheme();

  const getColors = (): { bg: string; border: string; textColor: ThemeColor } => {
    switch (variant) {
      case 'default':
        return { bg: theme.primary, border: theme.primary, textColor: 'primaryForeground' };
      case 'secondary':
        return { bg: theme.secondary, border: 'transparent', textColor: 'textSecondary' };
      case 'destructive':
        return { bg: theme.destructive + '22', border: theme.destructive + '44', textColor: 'destructive' };
      case 'outline':
        return { bg: 'transparent', border: theme.border, textColor: 'text' };
      case 'success':
        return { bg: theme.successMuted, border: theme.success + '44', textColor: 'success' };
      case 'warning':
        return { bg: theme.warningMuted, border: theme.warning + '44', textColor: 'warning' };
      case 'accent':
        return { bg: theme.accentMuted, border: theme.accent + '44', textColor: 'accent' };
      default:
        return { bg: theme.secondary, border: 'transparent', textColor: 'text' };
    }
  };

  const { bg, border, textColor } = getColors();

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg, borderColor: border },
        style,
      ]}
      {...props}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      {label ? (
        <ThemedText type="smallBold" themeColor={textColor} style={styles.label}>
          {label}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: 1,
    gap: Spacing.one,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
