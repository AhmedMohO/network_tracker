import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

import { sumUsage, type AppUsage } from './aggregate';
import { formatBytes } from './format';

type Totals = { download: number; upload: number; total: number };

/** One sentence naming what the total counts but the list below does not. */
function hiddenLine(hidden: AppUsage[]): string {
  const bytes = formatBytes(sumUsage(hidden).total);
  return hidden.length === 1
    ? `Includes 1 system app that is not listed below (${bytes}).`
    : `Includes ${hidden.length} system apps that are not listed below (${bytes}).`;
}

function Metric({ label, bytes }: { label: string; bytes: number }) {
  return (
    <View style={styles.metric}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default" numberOfLines={1} style={styles.metricValue}>
        {formatBytes(bytes)}
      </ThemedText>
    </View>
  );
}

export function TotalsCard({
  totals,
  note = null,
  title = 'Total used',
  hidden = [],
}: {
  totals: Totals;
  note?: string | null;
  /** Defaults to the device-level label; the detail screen names one app. */
  title?: string;
  /** Apps counted in `totals` that the list below does not show. */
  hidden?: AppUsage[];
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {title}
      </ThemedText>
      <ThemedText
        type="subtitle"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={styles.total}>
        {formatBytes(totals.total)}
      </ThemedText>
      <View style={styles.row}>
        <Metric label="↓ Download" bytes={totals.download} />
        <Metric label="↑ Upload" bytes={totals.upload} />
      </View>
      {/* Reconciles the headline with the list: it counts apps the list hides. */}
      {hidden.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hiddenLine(hidden)}
        </ThemedText>
      ) : null}
      {/* Coverage information, not a failure — plain secondary body text. */}
      {note ? (
        <ThemedText type="small" themeColor="textSecondary">
          {note}
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four },
  metric: { minWidth: 100 },
  metricValue: { fontVariant: ['tabular-nums'] },
});
