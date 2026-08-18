import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NetworkFilter } from '@modules/network-usage';

import { useUsageContext } from './useUsageContext';

const OPTIONS: { id: NetworkFilter; label: string }[] = [
  { id: 'MOBILE', label: 'Mobile' },
  { id: 'WIFI', label: 'Wi-Fi' },
  { id: 'ALL', label: 'All' },
];

export function NetworkFilterTabs() {
  const theme = useTheme();
  const { network, setNetwork } = useUsageContext();

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {OPTIONS.map((o) => {
        const selected = network === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => setNetwork(o.id)}
            accessibilityRole="tab"
            accessibilityLabel={`${o.label} data`}
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
              {o.label}
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
