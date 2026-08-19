import { ArrowRight, Sparkles, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { UsageDelta } from './aggregate';
import { AppIcon } from './AppIcon';
import { formatBytes } from './format';

export function DeltaRow({ delta, packageName }: { delta: UsageDelta; packageName: string | null }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const previous = formatBytes(delta.previous);
  const current = formatBytes(delta.current);

  const isNew = delta.changePercent === null;
  const isUp = (delta.changePercent ?? 0) > 0;
  const isDown = (delta.changePercent ?? 0) < 0;
  const changeValue = isNew
    ? t('compare.new')
    : `${isUp ? '+' : ''}${Math.round(delta.changePercent!)}%`;

  return (
    <View
      accessible
      accessibilityLabel={t('compare.rowA11y', {
        name: delta.name,
        previous,
        current,
        change: changeValue,
      })}
      style={[
        styles.row,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}>
      <AppIcon packageName={packageName} name={delta.name} size={40} />
      <View style={styles.body}>
        <View style={styles.line}>
          <ThemedText type="default" numberOfLines={1} style={styles.name}>
            {delta.name}
          </ThemedText>

          {isNew ? (
            <Badge
              variant="accent"
              icon={<Sparkles size={11} color={theme.accent} />}
              label={changeValue}
            />
          ) : isUp ? (
            <Badge
              variant="destructive"
              icon={<TrendingUp size={11} color={theme.destructive} />}
              label={changeValue}
            />
          ) : isDown ? (
            <Badge
              variant="success"
              icon={<TrendingDown size={11} color={theme.success} />}
              label={changeValue}
            />
          ) : (
            <Badge variant="secondary" label={changeValue} />
          )}
        </View>

        <View style={styles.bytesRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.bytes}>
            {previous}
          </ThemedText>
          <ArrowRight size={12} color={theme.textSecondary} />
          <ThemedText type="smallBold" style={styles.bytes}>
            {current}
          </ThemedText>
        </View>
      </View>
    </View>
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
  body: { flex: 1, gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  name: { flex: 1, fontWeight: '600', fontSize: 15 },
  bytesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  bytes: { fontVariant: ['tabular-nums'] },
});
