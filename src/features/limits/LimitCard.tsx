import { AlertOctagon, AlertTriangle, Calendar, ShieldCheck, TrendingUp } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { formatBytes } from '@/features/usage/format';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/i18n/format';

import type { LimitState, LimitStatus } from './limits';

const STATE_CONFIG: Record<
  LimitState,
  {
    themeColor: ThemeColor;
    badgeVariant: BadgeVariant;
    icon: React.ComponentType<{ size: number; color: string }>;
  }
> = {
  ok: { themeColor: 'accent', badgeVariant: 'accent', icon: ShieldCheck },
  warn: { themeColor: 'warning', badgeVariant: 'warning', icon: AlertTriangle },
  over: { themeColor: 'destructive', badgeVariant: 'destructive', icon: AlertOctagon },
};

/**
 * Two bars, not one: usage against the limit, and a marker for how far
 * through the cycle we are.
 */
export function LimitCard({
  status,
  coverage = null,
}: {
  status: LimitStatus;
  /** Window Android actually covered, when it is not the one requested. */
  coverage?: { start: number; end: number } | null;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const config = STATE_CONFIG[status.state];
  const Icon = config.icon;
  const overProjection = status.projectedBytes > status.limitBytes;
  const usedBytes = formatBytes(status.usedBytes);
  const limitBytes = formatBytes(status.limitBytes);
  const usedPercent = Math.round(status.usedPercent);
  const elapsedPercent = Math.round(status.elapsedPercent);

  const statusLabel =
    status.state === 'over'
      ? t('limits.over', { bytes: formatBytes(status.usedBytes - status.limitBytes) })
      : t('limits.remaining', { bytes: formatBytes(status.remainingBytes) });

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <View style={[styles.iconBox, { backgroundColor: theme[config.themeColor] + '20' }]}>
            <Icon size={16} color={theme[config.themeColor]} />
          </View>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('limits.title')}
          </ThemedText>
        </View>

        <Badge
          variant={config.badgeVariant}
          icon={<Icon size={12} color={theme[config.themeColor]} />}
          label={statusLabel}
        />
      </View>

      <View style={styles.headline}>
        <ThemedText type="title" numberOfLines={1} adjustsFontSizeToFit style={styles.usedAmount}>
          {usedBytes}
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.limitAmount}>
          {t('limits.of', { limit: limitBytes })}
        </ThemedText>
      </View>

      <View
        style={styles.progressContainer}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('limits.a11y', {
          used: usedBytes,
          limit: limitBytes,
          percent: usedPercent,
          elapsed: elapsedPercent,
        })}>
        <Progress
          value={status.usedPercent}
          secondaryValue={status.elapsedPercent}
          indicatorColor={theme[config.themeColor]}
          secondaryColor={theme.textSecondary}
          height={8}
        />

        <View style={styles.progressLabels}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('limits.used', { percent: usedPercent })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('limits.elapsed', { percent: elapsedPercent })}
          </ThemedText>
        </View>
      </View>

      <View style={styles.projectionRow}>
        <TrendingUp size={13} color={overProjection ? theme.destructive : theme.textSecondary} />
        <ThemedText
          type="small"
          themeColor={overProjection ? 'destructive' : 'textSecondary'}
          style={styles.projectionText}>
          {overProjection
            ? t('limits.projectedOver', { bytes: formatBytes(status.projectedBytes) })
            : t('limits.projected', { bytes: formatBytes(status.projectedBytes) })}
        </ThemedText>
      </View>

      {/* A billing cycle starts on an arbitrary day */}
      {coverage ? (
        <View style={styles.coverageRow}>
          <Calendar size={12} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.coverageText}>
            {t('chart.coverage', {
              from: formatDateTime(coverage.start),
              to: formatDateTime(coverage.end),
            })}
          </ThemedText>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  usedAmount: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  limitAmount: {
    fontSize: 15,
  },
  progressContainer: {
    gap: Spacing.one,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  projectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  projectionText: {
    flex: 1,
    fontSize: 13,
  },
  coverageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  coverageText: {
    fontSize: 12,
  },
});
