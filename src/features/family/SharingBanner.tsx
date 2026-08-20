import { useRouter } from 'expo-router';
import { Eye } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useFamily } from './useFamily';

/**
 * The trust boundary of the whole family feature: a persistent, unhideable
 * strip telling whoever is looking at this device that its usage is shared.
 * There is deliberately no prop or setting to hide it — a monitoring app
 * that can hide its own disclosure is stalkerware regardless of intent.
 */
export function SharingBanner() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { role, pairedLabel } = useFamily();

  if (role !== 'child') return null;

  return (
    <View
      style={[styles.banner, { backgroundColor: theme.accentMuted, borderColor: theme.accent + '44' }]}
      accessibilityRole="summary">
      <Eye size={16} color={theme.accent} />
      <ThemedText type="small" themeColor="accent" style={styles.text}>
        {t('family.sharingWith', { label: pairedLabel ?? '' })}
      </ThemedText>
      <Pressable
        onPress={() => router.push('/settings')}
        accessibilityRole="button"
        accessibilityLabel={t('family.bannerDetails')}
        hitSlop={8}>
        <ThemedText type="smallBold" themeColor="accent">
          {t('family.bannerDetails')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
  },
  text: {
    flex: 1,
  },
});
