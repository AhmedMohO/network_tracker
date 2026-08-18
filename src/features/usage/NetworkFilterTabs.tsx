import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NetworkFilter } from '@modules/network-usage';

import { useUsageContext } from './useUsageContext';

const OPTIONS: { id: NetworkFilter; key: string }[] = [
  { id: 'MOBILE', key: 'network.mobile' },
  { id: 'WIFI', key: 'network.wifi' },
  { id: 'ALL', key: 'network.all' },
];

export function NetworkFilterTabs() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { network, setNetwork } = useUsageContext();

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {OPTIONS.map((o) => {
        const selected = network === o.id;
        const label = t(o.key);
        return (
          <Pressable
            key={o.id}
            onPress={() => setNetwork(o.id)}
            accessibilityRole="tab"
            accessibilityLabel={t('network.a11y', { label })}
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: selected ? theme.accent : 'transparent',
                borderColor: selected ? theme.accent : theme.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}>
            <ThemedText
              type={selected ? 'smallBold' : 'small'}
              themeColor={selected ? 'accentForeground' : 'text'}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
  },
});
