import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing, TextEnd } from '@/constants/theme';

import type { UsageDelta } from './aggregate';
import { AppIcon } from './AppIcon';
import { formatBytes } from './format';

/** "+42%", or the `new` word when there is nothing to divide by. */
function changeLabel(percent: number | null, isNew: string): string {
  if (percent === null) return isNew;
  return `${percent > 0 ? '+' : ''}${Math.round(percent)}%`;
}

export function DeltaRow({ delta, packageName }: { delta: UsageDelta; packageName: string | null }) {
  const { t } = useTranslation();
  const previous = formatBytes(delta.previous);
  const current = formatBytes(delta.current);
  const change = changeLabel(delta.changePercent, t('compare.new'));
  // Up is the one worth flagging; a drop is good news and stays quiet.
  const color =
    delta.changePercent === null || delta.changePercent === 0
      ? 'textSecondary'
      : delta.changePercent > 0
        ? 'danger'
        : 'accent';

  return (
    <View
      accessible
      accessibilityLabel={t('compare.rowA11y', {
        name: delta.name,
        previous,
        current,
        change,
      })}
      style={styles.row}>
      <AppIcon packageName={packageName} name={delta.name} />
      <View style={styles.body}>
        <View style={styles.line}>
          <ThemedText type="default" numberOfLines={1} style={styles.name}>
            {delta.name}
          </ThemedText>
          <ThemedText type="smallBold" themeColor={color} style={styles.change}>
            {change}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.bytes}>
          {previous} → {current}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    gap: Spacing.three,
  },
  body: { flex: 1, gap: Spacing.one },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { flex: 1 },
  // Fixed width so the percentages line up into a scannable column.
  change: { width: 64, textAlign: TextEnd, fontVariant: ['tabular-nums'] },
  bytes: { fontVariant: ['tabular-nums'] },
});
