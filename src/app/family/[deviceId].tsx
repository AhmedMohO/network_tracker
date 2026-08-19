import { Stack, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, BarChart3, BellRing, Gauge, Percent } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { buildDailySeries } from '@/features/family/dailySeries';
import { useChildSnapshots } from '@/features/family/useChildren';
import { summarizeChildren, useFamily } from '@/features/family/useFamily';
// `childCycleUsedBytes` is `backgroundCheck.ts`'s own child-cycle math, reused
// here so the number this card shows can never drift from the number that
// decided whether the background task's notification fired. Importing it adds
// no new native dependency: `_layout.tsx` already loads this module at app
// start to register the background task.
import { childCycleUsedBytes } from '@/features/limits/backgroundCheck';
import { cycleRanges, limitStatus } from '@/features/limits/limits';
import { LimitCard } from '@/features/limits/LimitCard';
import { AppRow } from '@/features/usage/AppRow';
import { RangePicker } from '@/features/usage/RangePicker';
import { saveSettings } from '@/features/usage/settings';
import { TotalsCard } from '@/features/usage/TotalsCard';
import { UsageChart } from '@/features/usage/UsageChart';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/i18n/format';

/** A GB-denominated limit stores as bytes; matches `settings.tsx`'s own conversion. */
const GB = 1024 ** 3;

export default function ChildUsageScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { deviceId: rawDeviceId } = useLocalSearchParams<{ deviceId: string }>();
  const deviceId = rawDeviceId ?? '';
  const { role } = useFamily();
  const { range, settings, reloadSettings } = useUsageContext();
  const { snapshots } = useChildSnapshots(deviceId);

  const [limitGb, setLimitGb] = useState('');
  const [warnPercent, setWarnPercent] = useState('80');

  useEffect(() => {
    if (!settings || !deviceId) return;
    const existing = settings.childLimits[deviceId];
    setLimitGb(existing?.mobileLimitBytes ? String(existing.mobileLimitBytes / GB) : '');
    setWarnPercent(existing ? String(existing.warnAtPercent) : '80');
  }, [settings, deviceId]);

  // Same figure `backgroundCheck.ts`'s `checkChild` alerts against, so this
  // card and the notification never disagree — and same honesty rule: never
  // computed against data older than a stale cycle would silently misstate.
  const limitView = useMemo(() => {
    if (!settings || !deviceId) return null;
    const configured = settings.childLimits[deviceId];
    if (!configured?.mobileLimitBytes) return null;
    const now = Date.now();
    const usedBytes = childCycleUsedBytes(snapshots, settings.cycleStartDay, now);
    const { measurement } = cycleRanges(settings.cycleStartDay, now);
    return limitStatus(usedBytes, configured.mobileLimitBytes, measurement, now, configured.warnAtPercent);
  }, [settings, deviceId, snapshots]);

  const saveLimit = async () => {
    if (!deviceId) return;
    const gb = Number(limitGb);
    const mobileLimitBytes = Number.isFinite(gb) && gb > 0 ? gb * GB : null;
    const warn = Number(warnPercent);
    const warnAtPercent = Number.isFinite(warn) && warn > 0 && warn <= 100 ? warn : 80;

    try {
      await saveSettings({
        childLimits: {
          ...(settings?.childLimits ?? {}),
          [deviceId]: { mobileLimitBytes, warnAtPercent },
        },
      });
      reloadSettings();
      toast(t('limits.saved'));
    } catch {
      toast(t('limits.saveFailed'));
    }
  };

  // Reuses `summarizeChildren` (already tested in `useFamily.test.ts`) rather
  // than re-deriving "label from the newest row" here.
  const summary = useMemo(
    () => summarizeChildren(snapshots).find((c) => c.deviceId === deviceId) ?? null,
    [snapshots, deviceId]
  );

  const series = useMemo(
    () => buildDailySeries(snapshots, range.start, range.end, t('family.otherApps')),
    [snapshots, range.start, range.end, t]
  );

  const label = summary?.label ?? deviceId ?? '';
  const lastSeenLine =
    summary && summary.lastSeen > 0
      ? t('family.lastSeen', { when: formatDateTime(summary.lastSeen) })
      : t('family.neverCheckedIn');

  if (role !== 'parent') {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: t('family.listTitle') }} />
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.pad}>
            {t('family.parentOnly')}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: label }} />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* Always visible, never below the fold. */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.lastSeen}>
          {lastSeenLine}
        </ThemedText>

        <RangePicker />

        <FlatList
          data={series.apps}
          keyExtractor={(a) => String(a.uid)}
          style={styles.grow}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <TotalsCard totals={series.totals} />

              {series.bins.length > 0 ? (
                <View style={styles.chartCard}>
                  <View style={styles.chartHeader}>
                    <BarChart3 size={16} color={theme.accent} />
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {t('chart.title')}
                    </ThemedText>
                  </View>
                  <UsageChart bins={series.bins} />
                </View>
              ) : (
                <View
                  style={[
                    styles.chartEmpty,
                    { borderColor: theme.border, backgroundColor: theme.backgroundSelected },
                  ]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('family.detailEmpty')}
                  </ThemedText>
                </View>
              )}

              {/* A day with no `daily` row is a gap, not a zero-usage day —
                  the child may simply have been offline. */}
              {series.missingDays > 0 ? (
                <View style={styles.missingRow}>
                  <AlertTriangle size={13} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.missingText}>
                    {t('family.missingDays', { count: series.missingDays })}
                  </ThemedText>
                </View>
              ) : null}

              {/* This is a notification, not a control: nothing on this
                  device can stop or pause the child's own data use. */}
              <Card style={styles.limitCard}>
                <View style={styles.limitHeader}>
                  <View style={[styles.limitIconBox, { backgroundColor: theme.accentMuted }]}>
                    <BellRing size={16} color={theme.accent} />
                  </View>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {t('family.childLimitHeading')}
                  </ThemedText>
                </View>

                <ThemedText type="small" themeColor="textSecondary">
                  {t('family.childLimitHint', { label })}
                </ThemedText>

                {limitView ? <LimitCard status={limitView} /> : null}

                <View style={styles.fieldGroup}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('family.childLimitGb', { label })}
                  </ThemedText>
                  <Input
                    value={limitGb}
                    onChangeText={setLimitGb}
                    keyboardType="numeric"
                    icon={<Gauge size={16} color={theme.textSecondary} />}
                    placeholder={t('limits.limitPlaceholder')}
                    accessibilityLabel={t('family.childLimitGb', { label })}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('limits.warnAt')}
                  </ThemedText>
                  <Input
                    value={warnPercent}
                    onChangeText={setWarnPercent}
                    keyboardType="numeric"
                    icon={<Percent size={16} color={theme.textSecondary} />}
                    placeholder="80"
                    accessibilityLabel={t('limits.warnAt')}
                  />
                </View>

                <Button
                  variant="default"
                  title={t('limits.save')}
                  onPress={saveLimit}
                  accessibilityLabel={t('limits.save')}
                />
              </Card>
            </View>
          }
          renderItem={({ item }) => (
            // No per-app drill-down for a child's remote payload (Task 29
            // scope is the list itself, not a `usage/[uid]`-style detail for
            // it), so this only ever renders the row.
            <AppRow app={item} onPress={() => {}} />
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: {
    flex: 1,
    gap: Spacing.two + 2,
    paddingTop: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  pad: { padding: Spacing.four },
  lastSeen: { paddingHorizontal: Spacing.three },
  grow: { flex: 1 },
  header: { gap: Spacing.three, paddingBottom: Spacing.two },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  chartCard: { gap: Spacing.three },
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chartEmpty: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: 2,
  },
  missingText: { flex: 1 },
  limitCard: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  limitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  limitIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldGroup: {
    gap: Spacing.one,
  },
});
