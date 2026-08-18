import { reloadAppAsync } from 'expo';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { toast } from '@/components/toast';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { saveSettings } from '@/features/usage/settings';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES, setLanguage, type Language } from '@/i18n';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </ThemedView>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { settings, reloadSettings } = useUsageContext();

  const chooseLanguage = async (language: Language) => {
    if (language === i18n.language) return;
    const needsReload = await setLanguage(language);
    if (needsReload) {
      // The toast is a system window, so it outlives the bundle reload.
      toast(t('settings.restartNeeded'));
      reloadAppAsync();
    }
  };

  const toggleSystemApps = async (value: boolean) => {
    try {
      await saveSettings({ showSystemApps: value });
      reloadSettings();
    } catch {
      toast(t('settings.saveFailed'));
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">{t('settings.title')}</ThemedText>

          <Section title={t('settings.language')}>
            <View style={styles.chipRow}>
              {LANGUAGES.map((language) => {
                const active = i18n.language === language;
                return (
                  <Pressable
                    key={language}
                    onPress={() => chooseLanguage(language)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: active ? theme.accentMuted : 'transparent',
                        borderColor: active ? theme.accent : theme.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}>
                    <ThemedText
                      type={active ? 'smallBold' : 'small'}
                      themeColor={active ? 'accent' : 'text'}>
                      {t(language === 'ar' ? 'settings.arabic' : 'settings.english')}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title={t('settings.showSystemApps')}>
            <View style={styles.switchRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.switchLabel}>
                {t('settings.showSystemAppsHint')}
              </ThemedText>
              <Switch
                value={settings?.showSystemApps ?? false}
                onValueChange={toggleSystemApps}
                accessibilityLabel={t('settings.showSystemApps')}
                trackColor={{ true: theme.accentMuted, false: theme.backgroundSelected }}
                thumbColor={settings?.showSystemApps ? theme.accent : theme.border}
              />
            </View>
          </Section>

          <Section title={t('settings.privacyTitle')}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('settings.privacyBody')}
            </ThemedText>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  content: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.three,
  },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  chipRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    borderRadius: 999,
    borderWidth: 1,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  switchLabel: { flex: 1 },
});
