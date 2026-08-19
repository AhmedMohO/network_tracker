import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, BarChart3, BellRing, Clock, Gauge, Percent, Smartphone, Wifi } from 'lucide-react-native';
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
import { isTodayHeartbeat, TodayTotals } from '@/features/family/TodayTotals';
import { useChildSnapshots, type RecentPayload } from '@/features/family/useChildren';
import { summarizeChildren, useFamily } from '@/features/family/useFamily';
// `childCycleUsedBytes` is `backgroundCheck.ts`'s own child-cycle math, reused
// here so the number this card shows can never drift from the number that
// decided whether the background task's notification fired. Importing it adds
// no new native dependency: `_layout.tsx` already loads this module at app
// start to register the background task.
import { childCycleUsedBytes } from '@/features/limits/backgroundCheck';
import { isStale } from '@/features/limits/alerts';
import { cycleRanges, limitStatus } from '@/features/limits/limits';
import { AppRow } from '@/features/usage/AppRow';
import { formatBytes } from '@/features/usage/format';
import { NetworkFilterTabs } from '@/features/usage/NetworkFilterTabs';
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
  const { range, network, settings, reloadSettings } = useUsageContext();
  const { snapshots } = useChildSnapshots(deviceId);
  const router = useRouter();

  const [limitGb, setLimitGb] = useState('');
  const [warnPercent, setWarnPercent] = useState('80');

  useEffect(() => {
    if (!settings || !deviceId) return;
    const existing = settings.childLimits[deviceId];
    setLimitGb(existing?.mobileLimitBytes ? String(existing.mobileLimitBytes / GB) : '');
    setWarnPercent(existing ? String(existing.warnAtPercent) : '80');
  }, [settings, deviceId]);

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
    () => buildDailySeries(snapshots, range.start, range.end, t('family.otherApps'), Date.now(), network),
    [snapshots, range.start, range.end, t, network]
  );

  // The child's own newest `recent` heartbeat. `buildDailySeries` already
  // folds this into the range as a partial day (that is what makes the
  // default "today" range show anything at all), so this card is not the only
  // place it appears — it is the place that carries what a bin cannot: the
  // child's "as of" clock and Android's coverage window. Only rendered when
  // the heartbeat really is from today; a three-day-old one under a "Today so
  // far" heading is just a wrong number.
  // Carries the row's `updatedAt` alongside its payload: that is the server's
  // own stamp, and `TodayTotals` needs it so a child's unverified clock cannot
  // decide whether naming a foreground app is still honest (`checkInAt`).
  const recent = useMemo((): { payload: RecentPayload; serverAt: number } | null => {
    const row = snapshots
      .filter((s) => s.kind === 'recent')
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const payload: RecentPayload | undefined = row?.payload;
    if (!payload) return null;
    return isTodayHeartbeat(payload.at) ? { payload, serverAt: row.updatedAt } : null;
  }, [snapshots]);

  // Same figure `backgroundCheck.ts`'s `checkChild` alerts against, so this
  // card and the notification never disagree — and the same staleness rule:
  // data older than 3 hours says nothing about the present, so it is not
  // projected forward into a confident figure at all (`isStale`, shared with
  // the notification path) — `stale: true` carries only the "as of" time, no
  // usage number. `when` is the child's own clock — the newest `recent`
  // heartbeat if there is one, else the last time anything was seen from
  // this device — never this device's delivery time.
  const limitView = useMemo(() => {
    if (!settings || !deviceId || !summary) return null;
    const configured = settings.childLimits[deviceId];
    if (!configured?.mobileLimitBytes) return null;
    const now = Date.now();
    const when = recent?.payload.at ?? summary.lastSeen;
    if (isStale(summary.lastSeen, now)) return { stale: true as const, when };
    const usedBytes = childCycleUsedBytes(snapshots, settings.cycleStartDay, now);
    const { measurement } = cycleRanges(settings.cycleStartDay, now);
    const status = limitStatus(
      usedBytes,
      configured.mobileLimitBytes,
      measurement,
      now,
      configured.warnAtPercent
    );
    return { stale: false as const, status, when };
  }, [settings, deviceId, snapshots, summary, recent]);

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
        <NetworkFilterTabs />

        <FlatList
          data={series.apps}
          keyExtractor={(a) => String(a.uid)}
          style={styles.grow}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <TotalsCard totals={series.totals} />

              {/* Mobile vs WiFi breakdown for the selected range, when every
                  day in the range carries the network split. */}
              {series.networkTotals ? (
                <View style={styles.networkRow}>
                  <View style={styles.networkChip}>
                    <Smartphone size={13} color={theme.textSecondary} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('network.mobile')}
                    </ThemedText>
                    <ThemedText type="smallBold">
                      {formatBytes(series.networkTotals.mobile)}
                    </ThemedText>
                  </View>
                  <View style={styles.networkChip}>
                    <Wifi size={13} color={theme.textSecondary} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {t('network.wifi')}
                    </ThemedText>
                    <ThemedText type="smallBold">
                      {formatBytes(series.networkTotals.wifi)}
                    </ThemedText>
                  </View>
                </View>
              ) : null}

              {/* The split covers only the days that carry one. Saying which
                  days are missing from it beats either hiding the whole row
                  (what this used to do the moment one legacy day fell in
                  range) or letting it quietly under-report. */}
              {series.networkTotals && series.splitMissingDays > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('family.splitMissingDays', { count: series.splitMissingDays })}
                </ThemedText>
              ) : null}

              {/* The range's own totals above already include today, from the
                  heartbeat below. This card is what carries the child's "as
                  of" clock and Android's coverage window for it. */}
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <Clock size={16} color={theme.accent} />
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {t('family.todaySoFar')}
                  </ThemedText>
                </View>
                {recent ? (
                  <TodayTotals recent={recent.payload} serverAt={recent.serverAt} />
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    {/* A device that checked in last week has checked in —
                        just not today. The two are different facts. */}
                    {summary && summary.lastSeen > 0
                      ? t('family.noCheckInToday')
                      : t('family.neverCheckedIn')}
                  </ThemedText>
                )}
              </View>

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
              {/* The totals and the last chart bin include a day that is
                  still running, so they are a floor, not a final figure. */}
              {series.partialDay !== null ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('family.includesPartialDay')}
                </ThemedText>
              ) : null}

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

                {/* Not `LimitCard`: its copy is written in the second person
                    for the reader's own device ("you will use", "your
                    limit"). This is someone else's data, so it gets its own
                    third-person strings, naming the child, with the "as of"
                    time always visible — and when the data is stale, no
                    figure is shown at all rather than one projected forward
                    from a check-in over 3 hours old. */}
                {limitView?.stale ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('family.childLimitStale', { label, when: formatDateTime(limitView.when) })}
                  </ThemedText>
                ) : limitView ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {limitView.status.state === 'over'
                      ? t('family.childOverBody', {
                          label,
                          used: formatBytes(limitView.status.usedBytes),
                          limit: formatBytes(limitView.status.limitBytes),
                          when: formatDateTime(limitView.when),
                        })
                      : limitView.status.state === 'warn'
                        ? t('family.childWarnBody', {
                            label,
                            percent: Math.round(limitView.status.usedPercent),
                            when: formatDateTime(limitView.when),
                          })
                        : t('family.childLimitOkBody', {
                            label,
                            used: formatBytes(limitView.status.usedBytes),
                            limit: formatBytes(limitView.status.limitBytes),
                            when: formatDateTime(limitView.when),
                          })}
                  </ThemedText>
                ) : null}

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
            <AppRow
              app={item}
              // `fromPayload`'s trimmed-tail row is a sum of many apps under a
              // synthetic uid, so there is no per-app screen to open for it.
              onPress={
                item.uid < 0
                  ? undefined
                  : () => router.push(`/family/app/${item.uid}?deviceId=${deviceId}`)
              }
            />
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
  networkRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  networkChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
