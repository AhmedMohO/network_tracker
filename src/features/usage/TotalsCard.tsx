import { ArrowDown, ArrowUp, EyeOff, Info, Layers } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/i18n/format';

import { sumUsage, type AppUsage } from './aggregate';
import { formatBytes } from './format';

type Totals = { download: number; upload: number; total: number };

function MetricChip({
  label,
  bytes,
  isDownload,
}: {
  label: string;
  bytes: number;
  isDownload: boolean;
}) {
  const theme = useTheme();
  const Icon = isDownload ? ArrowDown : ArrowUp;
  const iconColor = isDownload ? theme.accent : theme.accentAlt;
  const bgBadge = isDownload ? theme.accentMuted : theme.accentAltMuted;

  return (
    <View
      style={[
        styles.metricChip,
        { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
      ]}>
      <View style={[styles.metricIconBox, { backgroundColor: bgBadge }]}>
        <Icon size={14} color={iconColor} strokeWidth={2.5} />
      </View>
      <View style={styles.metricTexts}>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          numberOfLines={1}
          style={styles.metricLabel}>
          {label}
        </ThemedText>
        <ThemedText
          type="default"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={styles.metricValue}>
          {formatBytes(bytes)}
        </ThemedText>
      </View>
    </View>
  );
}

export function TotalsCard({
  totals,
  coverage = null,
  title,
  hidden = [],
}: {
  totals: Totals;
  /** Window Android actually covered, when it is not the one requested. */
  coverage?: { start: number; end: number } | null;
  /** Defaults to the device-level label; the detail screen names one app. */
  title?: string;
  /** Apps counted in `totals` that the list below does not show. */
  hidden?: AppUsage[];
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <View style={[styles.headerIconBox, { backgroundColor: theme.accentMuted }]}>
            <Layers size={16} color={theme.accent} />
          </View>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {title ?? t('totals.title')}
          </ThemedText>
        </View>
      </View>

      <ThemedText
        type="title"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={styles.totalValue}>
        {formatBytes(totals.total)}
      </ThemedText>

      <View style={styles.metricsRow}>
        <MetricChip label={t('totals.download')} bytes={totals.download} isDownload={true} />
        <MetricChip label={t('totals.upload')} bytes={totals.upload} isDownload={false} />
      </View>

      {/* Reconciles the headline with the list: it counts apps the list hides. */}
      {hidden.length > 0 ? (
        <View style={[styles.infoRow, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
          <EyeOff size={13} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.infoText}>
            {t('totals.hidden', {
              count: hidden.length,
              bytes: formatBytes(sumUsage(hidden).total),
            })}
          </ThemedText>
        </View>
      ) : null}

      {/* Coverage information, not a failure — plain secondary body text. */}
      {coverage ? (
        <View style={styles.coverageRow}>
          <Info size={13} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.infoText}>
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
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalValue: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  metricChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.one + 2,
    minWidth: 0,
  },
  metricIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  metricTexts: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 12,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  coverageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
  },
});
