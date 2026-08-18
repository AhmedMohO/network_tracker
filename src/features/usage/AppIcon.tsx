import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useAppIcon } from './useAppIcon';

/**
 * The app's own launcher icon, with the first letter of its name as the
 * placeholder — system buckets like tethering have no package and no icon.
 */
export function AppIcon({
  packageName,
  name,
  size = 36,
}: {
  packageName: string | null;
  name: string;
  size?: number;
}) {
  const theme = useTheme();
  const uri = useAppIcon(packageName);
  const box = { width: size, height: size, borderRadius: size / 4 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={box}
        contentFit="contain"
        // Decorative: the row's own label already announces the app name.
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    );
  }

  return (
    <View style={[box, styles.fallback, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {name.trim().charAt(0).toUpperCase() || '?'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', padding: Spacing.half },
});
