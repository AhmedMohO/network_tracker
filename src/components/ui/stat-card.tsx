import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface StatCardProps extends ViewProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBgColor?: string;
  subtitle?: string;
  badge?: React.ReactNode;
}

export function StatCard({
  title,
  value,
  icon,
  iconBgColor,
  subtitle,
  badge,
  style,
  ...props
}: StatCardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
        },
        style,
      ]}
      {...props}>
      <View style={styles.topRow}>
        <View
          style={[
            styles.iconWrapper,
            { backgroundColor: iconBgColor || theme.accentMuted },
          ]}>
          {icon}
        </View>
        {badge}
      </View>

      <View style={styles.content}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText
          type="default"
          style={styles.value}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}>
          {value}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    gap: 2,
  },
  value: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
