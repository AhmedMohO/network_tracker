import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

import { useAppIcon } from './useAppIcon';

/**
 * The app's launcher icon with subtle rounded border and clean fallback avatar.
 */
export function AppIcon({
  packageName,
  name,
  size = 38,
}: {
  packageName: string | null;
  name: string;
  size?: number;
}) {
  const theme = useTheme();
  const uri = useAppIcon(packageName);
  const borderRadius = Math.round(size * 0.26);
  const box = { width: size, height: size, borderRadius };

  if (uri) {
    return (
      <View style={[box, styles.wrapper, { borderColor: theme.border }]}>
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="contain"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <View
      style={[
        box,
        styles.fallback,
        {
          backgroundColor: theme.accentMuted,
          borderColor: theme.border,
          borderWidth: 1,
        },
      ]}>
      <ThemedText
        type="smallBold"
        themeColor="accent"
        style={{ fontSize: Math.round(size * 0.42) }}>
        {initial}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
