import { reloadAppAsync } from 'expo';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { toast } from '@/components/toast';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { LimitCard } from '@/features/limits/LimitCard';
import { useLimitStatus } from '@/features/limits/useLimitStatus';
import { saveSettings } from '@/features/usage/settings';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES, setLanguage, type Language } from '@/i18n';

/** A GB-denominated limit stores as bytes; this converts both ways. */
const GB = 1024 ** 3;

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

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel={label}
        style={[styles.input, { borderColor: theme.border, color: theme.text }]}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { settings, reloadSettings } = useUsageContext();
  const limitStatus = useLimitStatus();

  const [limitGb, setLimitGb] = useState('');
  const [warnPercent, setWarnPercent] = useState('80');
  const [cycleDay, setCycleDay] = useState('1');

  useEffect(() => {
    if (!settings) return;
    setLimitGb(settings.mobileLimitBytes ? String(settings.mobileLimitBytes / GB) : '');
    setWarnPercent(String(settings.warnAtPercent));
    setCycleDay(String(settings.cycleStartDay));
  }, [settings]);

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

  const saveLimit = async () => {
    const gb = Number(limitGb);
    const warn = Number(warnPercent);
    const day = Number(cycleDay);
    try {
      await saveSettings({
        mobileLimitBytes: Number.isFinite(gb) && gb > 0 ? gb * GB : null,
        warnAtPercent: Number.isFinite(warn) && warn > 0 && warn <= 100 ? warn : 80,
        cycleStartDay: Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1,
      });
      reloadSettings();
      toast(t('limits.saved'));
    } catch {
      toast(t('limits.saveFailed'));
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

          <Section title={t('limits.title')}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('limits.hint')}
            </ThemedText>

            {limitStatus ? (
              <LimitCard status={limitStatus} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                {t('limits.none')}
              </ThemedText>
            )}

            <Field
              label={t('limits.limitGb')}
              value={limitGb}
              onChangeText={setLimitGb}
              placeholder={t('limits.limitPlaceholder')}
            />
            <Field label={t('limits.warnAt')} value={warnPercent} onChangeText={setWarnPercent} />
            <Field label={t('limits.cycleDay')} value={cycleDay} onChangeText={setCycleDay} />

            <Pressable
              onPress={saveLimit}
              accessibilityRole="button"
              accessibilityLabel={t('limits.save')}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
              ]}>
              <ThemedText type="default" themeColor="accentForeground">
                {t('limits.save')}
              </ThemedText>
            </Pressable>
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
  field: { gap: Spacing.one },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  saveButton: {
    minHeight: 48,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
});
