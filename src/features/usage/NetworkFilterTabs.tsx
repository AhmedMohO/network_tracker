import { Globe, Smartphone, Wifi } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NetworkFilter } from '@modules/network-usage';

import { useUsageContext } from './useUsageContext';

const OPTIONS: { id: NetworkFilter; key: string; icon: React.ComponentType<{ size: number; color: string }> }[] = [
  { id: 'MOBILE', key: 'network.mobile', icon: Smartphone },
  { id: 'WIFI', key: 'network.wifi', icon: Wifi },
  { id: 'ALL', key: 'network.all', icon: Globe },
];

export function NetworkFilterTabs({ style }: { style?: any }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { network, setNetwork } = useUsageContext();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.card, borderColor: theme.border },
        style,
      ]}
      accessibilityRole="tablist">
      {OPTIONS.map((o) => {
        const selected = network === o.id;
        const label = t(o.key);
        const Icon = o.icon;
        const iconColor = selected ? theme.primaryForeground : theme.textSecondary;

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
                backgroundColor: selected ? theme.primary : 'transparent',
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <Icon size={14} color={iconColor} />
            <ThemedText
              type={selected ? 'smallBold' : 'small'}
              themeColor={selected ? 'primaryForeground' : 'textSecondary'}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={styles.tabText}>
              {label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    padding: 3,
    borderWidth: 1,
    alignSelf: 'stretch',
    gap: 2,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.one + 2,
    borderRadius: Radius.full,
    minHeight: 40,
  },
  tabText: {
    flexShrink: 1,
  },
});
