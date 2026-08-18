import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

import { formatBytes } from './format';

type Totals = { download: number; upload: number; total: number };

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

export function TotalsCard({ totals, note }: { totals: Totals; note: string | null }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        Total used
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
