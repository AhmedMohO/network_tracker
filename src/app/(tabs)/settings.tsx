import { reloadAppAsync } from 'expo';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { toast } from '@/components/toast';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { LimitCard } from '@/features/limits/LimitCard';
import type { LimitNetwork } from '@/features/limits/limits';
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

const LIMIT_TABS: { id: LimitNetwork; key: string }[] = [
  { id: 'MOBILE', key: 'network.mobile' },
  { id: 'WIFI', key: 'network.wifi' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { settings, reloadSettings } = useUsageContext();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LimitNetwork>('MOBILE');
  const isWifi = activeTab === 'WIFI';
  // Only the visible tab's limit is queried; switching tabs refetches.
  const limitStatus = useLimitStatus(activeTab);

  const [mobileLimitGb, setMobileLimitGb] = useState('');
  const [mobileWarnPercent, setMobileWarnPercent] = useState('80');

  const [wifiLimitGb, setWifiLimitGb] = useState('');
  const [wifiWarnPercent, setWifiWarnPercent] = useState('80');

  // One cycle day for both networks: it is also what the dashboard's cycle
  // presets read, so a per-network day would put the range picker and the
  // limit card on different windows.
  const [cycleDay, setCycleDay] = useState('1');

  useEffect(() => {
    if (!settings) return;
    setMobileLimitGb(settings.mobileLimitBytes ? String(settings.mobileLimitBytes / GB) : '');
    setMobileWarnPercent(String(settings.mobileWarnAtPercent));

    setWifiLimitGb(settings.wifiLimitBytes ? String(settings.wifiLimitBytes / GB) : '');
    setWifiWarnPercent(String(settings.wifiWarnAtPercent));

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

  /** Both networks are saved together, so edits made on the tab you switched
   * away from are not silently dropped. */
  const saveLimit = async () => {
    const limitBytes = (value: string) => {
      const gb = Number(value);
      return Number.isFinite(gb) && gb > 0 ? gb * GB : null;
    };
    const percent = (value: string) => {
      const warn = Number(value);
      return Number.isFinite(warn) && warn > 0 && warn <= 100 ? warn : 80;
    };
    const day = Number(cycleDay);

    try {
      await saveSettings({
        mobileLimitBytes: limitBytes(mobileLimitGb),
        mobileWarnAtPercent: percent(mobileWarnPercent),
        wifiLimitBytes: limitBytes(wifiLimitGb),
        wifiWarnAtPercent: percent(wifiWarnPercent),
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
            {/* Outside the tabs on purpose: one cycle day serves both
                networks and the dashboard's cycle presets. */}
            <Field label={t('limits.cycleDay')} value={cycleDay} onChangeText={setCycleDay} />

            <View style={styles.chipRow} accessibilityRole="tablist">
              {LIMIT_TABS.map(({ id, key }) => {
                const selected = activeTab === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setActiveTab(id)}
                    accessibilityRole="tab"
                    accessibilityLabel={t(key)}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.accent : 'transparent',
                        borderColor: selected ? theme.accent : theme.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}>
                    <ThemedText
                      type={selected ? 'smallBold' : 'small'}
                      themeColor={selected ? 'accentForeground' : 'text'}>
                      {t(key)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <ThemedText type="small" themeColor="textSecondary">
              {t(isWifi ? 'limits.wifiHint' : 'limits.hint')}
            </ThemedText>

            {limitStatus ? (
              <LimitCard status={limitStatus.status} coverage={limitStatus.coverage} />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                {t(isWifi ? 'limits.noneWifi' : 'limits.noneMobile')}
              </ThemedText>
            )}

            <Field
              label={t(isWifi ? 'limits.wifiLimitGb' : 'limits.mobileLimitGb')}
              value={isWifi ? wifiLimitGb : mobileLimitGb}
              onChangeText={isWifi ? setWifiLimitGb : setMobileLimitGb}
              placeholder={t('limits.limitPlaceholder')}
            />
            <Field
              label={t('limits.warnAt')}
              value={isWifi ? wifiWarnPercent : mobileWarnPercent}
              onChangeText={isWifi ? setWifiWarnPercent : setMobileWarnPercent}
            />

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

          <Section title={t('updateScreen.title')}>
            <Pressable
              onPress={() => router.push('/update')}
              accessibilityRole="button"
              accessibilityLabel={t('updateScreen.check')}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
              ]}>
              <ThemedText type="default" themeColor="accentForeground">
                {t('updateScreen.check')}
              </ThemedText>
            </Pressable>
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
