import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TextEnd } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { AppUsage } from './aggregate';
import { AppIcon } from './AppIcon';
import { formatBytes } from './format';

/** A share this small still gets a visible sliver rather than nothing at all. */
const MIN_VISIBLE_PERCENT = 1;

export function AppRow({ app, onPress }: { app: AppUsage; onPress?: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const share = app.percentage <= 0 ? 0 : Math.max(app.percentage, MIN_VISIBLE_PERCENT);
  const bytes = formatBytes(app.total);
  const percent = Math.round(app.percentage);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('app.rowA11y', { name: app.name, bytes, percent })}
      accessibilityHint={t('app.rowHint')}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? theme.backgroundSelected : theme.card,
          borderColor: theme.border,
        },
      ]}>
      <AppIcon packageName={app.packageName} name={app.name} size={40} />
      <View style={styles.body}>
        <View style={styles.line}>
          <ThemedText type="default" numberOfLines={1} style={styles.name}>
            {app.name}
          </ThemedText>
          <ThemedText type="default" style={styles.bytes}>
            {bytes}
          </ThemedText>
        </View>

        <View style={styles.line}>
          <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${share}%`,
                  backgroundColor: theme.primary,
                },
              ]}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.percent}>
            {percent}%
          </ThemedText>
        </View>
      </View>
      <ChevronRight size={16} color={theme.textSecondary} style={{ opacity: 0.6 }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: Spacing.three,
  },
  body: { flex: 1, gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flex: 1, fontWeight: '600', fontSize: 15 },
  bytes: {
    flexShrink: 0,
    fontWeight: '700',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  track: { flex: 1, height: 6, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: 6, borderRadius: Radius.full },
  percent: { width: 38, textAlign: TextEnd, fontVariant: ['tabular-nums'], fontSize: 12 },
});
