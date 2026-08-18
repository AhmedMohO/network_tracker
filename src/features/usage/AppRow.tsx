import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { AppUsage } from './aggregate';
import { formatBytes } from './format';

/** A share this small still gets a visible sliver rather than nothing at all. */
const MIN_VISIBLE_PERCENT = 1;

export function AppRow({ app, onPress }: { app: AppUsage; onPress: () => void }) {
  const theme = useTheme();
  const share = app.percentage <= 0 ? 0 : Math.max(app.percentage, MIN_VISIBLE_PERCENT);
  const bytes = formatBytes(app.total);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${app.name}, ${bytes}, ${Math.round(app.percentage)} percent of total`}
      accessibilityHint="Opens this app's usage details"
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.line}>
        <ThemedText type="default" numberOfLines={1} style={styles.name}>
          {app.name}
        </ThemedText>
        <ThemedText type="smallBold" style={styles.bytes}>
          {bytes}
        </ThemedText>
      </View>
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: `${share}%`, backgroundColor: theme.accent }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.three },
  name: { flex: 1 },
  bytes: { flexShrink: 0, fontVariant: ['tabular-nums'] },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
