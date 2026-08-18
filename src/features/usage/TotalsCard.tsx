import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/i18n/format';

import { sumUsage, type AppUsage } from './aggregate';
import { formatBytes } from './format';

type Totals = { download: number; upload: number; total: number };

function Metric({ label, bytes, arrow }: { label: string; bytes: number; arrow: string }) {
  return (
    <View style={styles.metric}>
      <ThemedText type="small" themeColor="textSecondary">
        {arrow} {label}
      </ThemedText>
      <ThemedText type="default" numberOfLines={1} style={styles.metricValue}>
        {formatBytes(bytes)}
      </ThemedText>
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
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {title ?? t('totals.title')}
      </ThemedText>
      <ThemedText type="subtitle" numberOfLines={1} adjustsFontSizeToFit style={styles.total}>
        {formatBytes(totals.total)}
      </ThemedText>
      <View style={[styles.row, { borderTopColor: theme.border }]}>
        <Metric label={t('totals.download')} bytes={totals.download} arrow="↓" />
        <Metric label={t('totals.upload')} bytes={totals.upload} arrow="↑" />
      </View>
      {/* Reconciles the headline with the list: it counts apps the list hides. */}
      {hidden.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('totals.hidden', {
            count: hidden.length,
            bytes: formatBytes(sumUsage(hidden).total),
          })}
        </ThemedText>
      ) : null}
      {/* Coverage information, not a failure — plain secondary body text. */}
      {coverage ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('chart.coverage', {
            from: formatDateTime(coverage.start),
            to: formatDateTime(coverage.end),
          })}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  total: { fontVariant: ['tabular-nums'] },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  metric: { minWidth: 100 },
  metricValue: { fontVariant: ['tabular-nums'] },
});
