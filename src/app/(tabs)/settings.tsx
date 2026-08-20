import { reloadAppAsync } from 'expo';
import { useRouter } from 'expo-router';
import {
  Calendar,
  Check,
  DownloadCloud,
  Gauge,
  Globe,
  Languages,
  Lock,
  Percent,
  Save,
  Sliders,
  Smartphone,
  Users,
  Wifi,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { PairingCard } from '@/features/family/PairingCard';
import { useFamily } from '@/features/family/useFamily';
import { LimitCard } from '@/features/limits/LimitCard';
import type { LimitNetwork } from '@/features/limits/limits';
import { useLimitStatus } from '@/features/limits/useLimitStatus';
import { saveSettings } from '@/features/usage/settings';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES, setLanguage, type Language } from '@/i18n';

/** A GB-denominated limit stores as bytes; this converts both ways. */
const GB = 1024 ** 3;

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIconBox, { backgroundColor: theme.accentMuted }]}>
        {icon}
      </View>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title}
      </ThemedText>
    </View>
  );
}

const LIMIT_TABS: { id: LimitNetwork; key: string; icon: React.ComponentType<{ size: number; color: string }> }[] = [
  { id: 'MOBILE', key: 'network.mobile', icon: Smartphone },
  { id: 'WIFI', key: 'network.wifi', icon: Wifi },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { settings, reloadSettings } = useUsageContext();
  const { role: familyRole } = useFamily();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<LimitNetwork>('MOBILE');
  const isWifi = activeTab === 'WIFI';
  const limitStatus = useLimitStatus(activeTab);

  const [mobileLimitGb, setMobileLimitGb] = useState('');
  const [mobileWarnPercent, setMobileWarnPercent] = useState('80');

  const [wifiLimitGb, setWifiLimitGb] = useState('');
  const [wifiWarnPercent, setWifiWarnPercent] = useState('80');

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
          {/* Header Title */}
          <ThemedText type="subtitle" style={styles.screenTitle}>
            {t('settings.title')}
          </ThemedText>

          {/* Language Selection Card */}
          <Card style={styles.card}>
            <SectionHeader
              icon={<Languages size={16} color={theme.accent} />}
              title={t('settings.language')}
            />

            <View style={styles.languageGrid}>
              {LANGUAGES.map((language) => {
                const active = i18n.language === language;
                return (
                  <Pressable
                    key={language}
                    onPress={() => chooseLanguage(language)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.languageTile,
                      {
                        backgroundColor: active ? theme.accentMuted : theme.backgroundSelected,
                        borderColor: active ? theme.accent : theme.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}>
                    <Globe size={16} color={active ? theme.accent : theme.textSecondary} />
                    <ThemedText
                      type={active ? 'smallBold' : 'small'}
                      themeColor={active ? 'accent' : 'text'}>
                      {t(language === 'ar' ? 'settings.arabic' : 'settings.english')}
                    </ThemedText>
                    {active ? <Check size={14} color={theme.accent} style={{ marginStart: 'auto' }} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Data Limits Card */}
          <Card style={styles.card}>
            <SectionHeader
              icon={<Gauge size={16} color={theme.accent} />}
              title={t('limits.title')}
            />

            {/* Cycle Start Day */}
            <View style={styles.fieldGroup}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('limits.cycleDay')}
              </ThemedText>
              <Input
                value={cycleDay}
                onChangeText={setCycleDay}
                keyboardType="numeric"
                icon={<Calendar size={16} color={theme.textSecondary} />}
                placeholder="1"
                accessibilityLabel={t('limits.cycleDay')}
              />
            </View>

            {/* Network Selector Tabs */}
            <View style={[styles.networkTablist, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]} accessibilityRole="tablist">
              {LIMIT_TABS.map(({ id, key, icon: Icon }) => {
                const selected = activeTab === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setActiveTab(id)}
                    accessibilityRole="tab"
                    accessibilityLabel={t(key)}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.networkTab,
                      {
                        backgroundColor: selected ? theme.primary : 'transparent',
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}>
                    <Icon size={14} color={selected ? theme.primaryForeground : theme.textSecondary} />
                    <ThemedText
                      type={selected ? 'smallBold' : 'small'}
                      themeColor={selected ? 'primaryForeground' : 'textSecondary'}>
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
              <View style={[styles.emptyLimitBox, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t(isWifi ? 'limits.noneWifi' : 'limits.noneMobile')}
                </ThemedText>
              </View>
            )}

            {/* GB Limit Input */}
            <View style={styles.fieldGroup}>
              <ThemedText type="small" themeColor="textSecondary">
                {t(isWifi ? 'limits.wifiLimitGb' : 'limits.mobileLimitGb')}
              </ThemedText>
              <Input
                value={isWifi ? wifiLimitGb : mobileLimitGb}
                onChangeText={isWifi ? setWifiLimitGb : setMobileLimitGb}
                keyboardType="numeric"
                icon={<Gauge size={16} color={theme.textSecondary} />}
                placeholder={t('limits.limitPlaceholder')}
                accessibilityLabel={t(isWifi ? 'limits.wifiLimitGb' : 'limits.mobileLimitGb')}
              />
            </View>

            {/* Warn at Percentage */}
            <View style={styles.fieldGroup}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('limits.warnAt')}
              </ThemedText>
              <Input
                value={isWifi ? wifiWarnPercent : mobileWarnPercent}
                onChangeText={isWifi ? setWifiWarnPercent : setMobileWarnPercent}
                keyboardType="numeric"
                icon={<Percent size={16} color={theme.textSecondary} />}
                placeholder="80"
                accessibilityLabel={t('limits.warnAt')}
              />
            </View>

            <Button
              variant="default"
              icon={<Save size={16} color={theme.primaryForeground} />}
              title={t('limits.save')}
              onPress={saveLimit}
              accessibilityLabel={t('limits.save')}
              style={styles.saveBtn}
            />
          </Card>

          {/* System Apps Toggle Card */}
          <Card style={styles.card}>
            <SectionHeader
              icon={<Sliders size={16} color={theme.accent} />}
              title={t('settings.showSystemApps')}
            />
            <View style={styles.switchRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.switchLabel}>
                {t('settings.showSystemAppsHint')}
              </ThemedText>
              <Switch
                value={settings?.showSystemApps ?? false}
                onValueChange={toggleSystemApps}
                accessibilityLabel={t('settings.showSystemApps')}
                trackColor={{ true: theme.accentMuted, false: theme.backgroundSelected }}
                thumbColor={settings?.showSystemApps ? theme.primary : theme.border}
              />
            </View>
          </Card>

          {/* Updates Card */}
          <Card style={styles.card}>
            <SectionHeader
              icon={<DownloadCloud size={16} color={theme.accent} />}
              title={t('updateScreen.title')}
            />
            <Button
              variant="secondary"
              icon={<DownloadCloud size={16} color={theme.text} />}
              title={t('updateScreen.check')}
              onPress={() => router.push('/update')}
              accessibilityLabel={t('updateScreen.check')}
            />
          </Card>

          {/* Family Sharing Card */}
          <PairingCard />

          {/* Family list entry point — parent devices only. Not a sixth
              native tab: there are already five. */}
          {familyRole === 'parent' && (
            <Card style={styles.card}>
              <SectionHeader
                icon={<Users size={16} color={theme.accent} />}
                title={t('family.listTitle')}
              />
              <Button
                variant="secondary"
                icon={<Users size={16} color={theme.text} />}
                title={t('family.viewChildren')}
                onPress={() => router.push('/family')}
                accessibilityLabel={t('family.viewChildren')}
              />
            </Card>
          )}

          {/* Privacy Guarantee Card */}
          <Card style={styles.card}>
            <SectionHeader
              icon={<Lock size={16} color={theme.accent} />}
              title={t('settings.privacyTitle')}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {t(
                familyRole === 'parent'
                  ? 'settings.privacyBodyParent'
                  : familyRole === 'child'
                    ? 'settings.privacyBodyChild'
                    : 'settings.privacyBodyUnpaired'
              )}
            </ThemedText>
          </Card>
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
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  screenTitle: {
    fontWeight: '800',
    fontSize: 26,
    paddingHorizontal: 2,
  },
  card: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sectionIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  languageTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.two,
    minHeight: 46,
  },
  networkTablist: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    padding: 3,
    borderWidth: 1,
    gap: 2,
  },
  networkTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    minHeight: 44,
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  emptyLimitBox: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  saveBtn: {
    marginTop: Spacing.one,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  switchLabel: { flex: 1 },
});
