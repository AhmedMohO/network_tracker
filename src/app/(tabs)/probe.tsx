import {
  Activity,
  AlertCircle,
  Bell,
  Cpu,
  Layers,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { runUsageCheck } from '@/features/limits/backgroundCheck';
import { ensureNotificationSetup, notify } from '@/features/limits/notify';
import { loadSettings, saveSettings } from '@/features/usage/settings';
import { useTheme } from '@/hooks/use-theme';
import NetworkUsage, {
  AppUsageRow,
  NetworkFilter,
  SeriesResult,
} from '@modules/network-usage';
import { useFocusEffect } from 'expo-router';

type DeviceSample = {
  time: string;
  mbpsMobileRx: number;
  mbpsMobileTx: number;
  mbpsTotalRx: number;
  mbpsTotalTx: number;
  unsupported: boolean;
};

type AppProbeSample = {
  time: string;
  rowCount: number;
  changed: string[];
};

export default function Probe() {
  const theme = useTheme();
  const [granted, setGranted] = useState(false);
  const [rows, setRows] = useState<AppUsageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesResult | null>(null);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<string | null>(null);

  const [deviceSamples, setDeviceSamples] = useState<DeviceSample[]>([]);
  const [deviceProbeRunning, setDeviceProbeRunning] = useState(false);
  const deviceProbeTimers = useRef<{
    interval?: ReturnType<typeof setInterval>;
    timeout?: ReturnType<typeof setTimeout>;
  }>({});
  const prevDeviceCounters = useRef<{
    mobileRx: number;
    mobileTx: number;
    totalRx: number;
    totalTx: number;
  } | null>(null);

  const [appProbeSamples, setAppProbeSamples] = useState<AppProbeSample[]>([]);
  const [appProbeRunning, setAppProbeRunning] = useState(false);
  const appProbeTimers = useRef<{
    interval?: ReturnType<typeof setInterval>;
    timeout?: ReturnType<typeof setTimeout>;
  }>({});
  const prevAppTotals = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    return () => {
      clearInterval(deviceProbeTimers.current.interval);
      clearTimeout(deviceProbeTimers.current.timeout);
      clearInterval(appProbeTimers.current.interval);
      clearTimeout(appProbeTimers.current.timeout);
    };
  }, []);

  const refresh = useCallback(() => {
    setGranted(NetworkUsage.hasUsageAccess());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') refresh();
      });
      return () => sub.remove();
    }, [refresh]),
  );

  const runQuery = async (network: NetworkFilter) => {
    setError(null);
    const end = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const start = startOfToday.getTime() - 6 * 86_400_000;
    try {
      const result = await NetworkUsage.getAppUsage({ start, end, network });
      result.sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes));
      setRows(result);
    } catch (e) {
      setError(String(e));
    }
  };

  const runSeriesProbe = async () => {
    setSeriesError(null);
    const today = new Date();
    today.setHours(14, 37, 0, 0);
    const start = today.getTime();
    const end = start + (16 * 60 + 12 - (14 * 60 + 37)) * 60_000;
    try {
      const result = await NetworkUsage.getSeries({
        start,
        end,
        network: 'MOBILE',
        bucketMs: 900_000,
      });
      setSeries(result);
    } catch (e) {
      setSeriesError(String(e));
    }
  };

  const runDeviceProbe = () => {
    clearInterval(deviceProbeTimers.current.interval);
    clearTimeout(deviceProbeTimers.current.timeout);
    setDeviceSamples([]);
    prevDeviceCounters.current = null;
    setDeviceProbeRunning(true);

    deviceProbeTimers.current.interval = setInterval(() => {
      const c = NetworkUsage.getDeviceCounters();
      const prev = prevDeviceCounters.current;
      prevDeviceCounters.current = c;
      if (!prev) return;

      const anyNegative = [
        c.mobileRx,
        c.mobileTx,
        c.totalRx,
        c.totalTx,
        prev.mobileRx,
        prev.mobileTx,
        prev.totalRx,
        prev.totalTx,
      ].some((v) => v < 0);
      const toMbps = (now: number, before: number) =>
        (now - before) / 1_000_000;
      setDeviceSamples((s) => [
        ...s,
        {
          time: new Date().toISOString(),
          mbpsMobileRx: toMbps(c.mobileRx, prev.mobileRx),
          mbpsMobileTx: toMbps(c.mobileTx, prev.mobileTx),
          mbpsTotalRx: toMbps(c.totalRx, prev.totalRx),
          mbpsTotalTx: toMbps(c.totalTx, prev.totalTx),
          unsupported: anyNegative,
        },
      ]);
    }, 1000);

    deviceProbeTimers.current.timeout = setTimeout(() => {
      clearInterval(deviceProbeTimers.current.interval);
      setDeviceProbeRunning(false);
    }, 30_000);
  };

  const runAppLiveProbe = () => {
    clearInterval(appProbeTimers.current.interval);
    clearTimeout(appProbeTimers.current.timeout);
    setAppProbeSamples([]);
    prevAppTotals.current = new Map();
    setAppProbeRunning(true);

    appProbeTimers.current.interval = setInterval(async () => {
      const end = Date.now();
      const start = end - 10_000;
      try {
        const result = await NetworkUsage.getAppUsage({
          start,
          end,
          network: 'MOBILE',
        });
        const changed: string[] = [];
        const nextTotals = new Map<number, number>();
        for (const r of result) {
          const total = r.rxBytes + r.txBytes;
          nextTotals.set(r.uid, total);
          if (prevAppTotals.current.get(r.uid) !== total) {
            changed.push(`${r.uid} ${r.label ?? '(unknown)'}`);
          }
        }
        prevAppTotals.current = nextTotals;
        setAppProbeSamples((s) => [
          ...s,
          { time: new Date().toISOString(), rowCount: result.length, changed },
        ]);
      } catch (e) {
        setAppProbeSamples((s) => [
          ...s,
          {
            time: new Date().toISOString(),
            rowCount: -1,
            changed: [String(e)],
          },
        ]);
      }
    }, 2000);

    appProbeTimers.current.timeout = setTimeout(() => {
      clearInterval(appProbeTimers.current.interval);
      setAppProbeRunning(false);
    }, 60_000);
  };

  const totalRx = rows.reduce((sum, r) => sum + r.rxBytes, 0);
  const totalTx = rows.reduce((sum, r) => sum + r.txBytes, 0);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle" style={styles.screenTitle}>
            Diagnostic Probes
          </ThemedText>

          {/* Usage Access Status Card */}
          <Card style={styles.card}>
            <View style={styles.headerRow}>
              <View style={[styles.iconBox, { backgroundColor: theme.accentMuted }]}>
                <Terminal size={18} color={theme.accent} />
              </View>
              <ThemedText type="default" style={{ fontWeight: '700', flex: 1 }}>
                Usage Access Status
              </ThemedText>
              <Badge
                variant={granted ? 'success' : 'destructive'}
                icon={granted ? <ShieldCheck size={12} color={theme.success} /> : <ShieldAlert size={12} color={theme.destructive} />}
                label={granted ? 'GRANTED' : 'DENIED'}
              />
            </View>

            {!granted && (
              <Button
                variant="default"
                title="Open usage access settings"
                onPress={() => NetworkUsage.openUsageAccessSettings()}
              />
            )}

            <View style={styles.buttonRow}>
              <Button size="sm" variant="outline" title="MOBILE (7d)" onPress={() => runQuery('MOBILE')} />
              <Button size="sm" variant="outline" title="WIFI (7d)" onPress={() => runQuery('WIFI')} />
              <Button size="sm" variant="outline" title="ALL (7d)" onPress={() => runQuery('ALL')} />
            </View>

            {error && (
              <View style={[styles.errorBox, { backgroundColor: theme.destructive + '22', borderColor: theme.destructive + '44' }]}>
                <AlertCircle size={14} color={theme.destructive} />
                <ThemedText type="small" themeColor="destructive">{error}</ThemedText>
              </View>
            )}

            {rows.length > 0 && (
              <View style={[styles.logPanel, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                <ThemedText type="code" style={{ fontWeight: '700' }}>
                  Total rx: {totalRx} · tx: {totalTx} ({rows.length} apps)
                </ThemedText>
                <ThemedText type="code">
                  Covered: {new Date(rows[0].coveredStart).toISOString()} –{' '}
                  {new Date(rows[0].coveredEnd).toISOString()}
                </ThemedText>
                {rows.map((r) => (
                  <ThemedText key={r.uid} type="code">
                    {r.uid} · {r.label ?? '(unknown)'} · rx {r.rxBytes} · tx {r.txBytes}
                  </ThemedText>
                ))}
              </View>
            )}
          </Card>

          {/* Granularity Probe Card */}
          <Card style={styles.card}>
            <View style={styles.headerRow}>
              <View style={[styles.iconBox, { backgroundColor: theme.accentMuted }]}>
                <Cpu size={18} color={theme.accent} />
              </View>
              <ThemedText type="default" style={{ fontWeight: '700', flex: 1 }}>
                Granularity Probe
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              14:37:00 – 16:12:00, MOBILE, 15-min buckets
            </ThemedText>

            <Button
              variant="secondary"
              icon={<Play size={14} color={theme.text} />}
              title="Run granularity probe"
              onPress={runSeriesProbe}
            />

            {seriesError && (
              <ThemedText type="small" themeColor="destructive">{seriesError}</ThemedText>
            )}

            {series && (
              <View style={[styles.logPanel, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                <ThemedText type="code" style={{ fontWeight: '700' }}>
                  Covered: {new Date(series.coveredStart).toISOString()} – {new Date(series.coveredEnd).toISOString()}
                </ThemedText>
                {series.bins
                  .filter((b) => b.rxBytes > 0 || b.txBytes > 0)
                  .map((b) => (
                    <ThemedText key={b.start} type="code">
                      {new Date(b.start).toISOString()} – {new Date(b.end).toISOString()} · rx {b.rxBytes} · tx {b.txBytes}
                    </ThemedText>
                  ))}
              </View>
            )}
          </Card>

          {/* Device Live Speed Probe */}
          <Card style={styles.card}>
            <View style={styles.headerRow}>
              <View style={[styles.iconBox, { backgroundColor: theme.accentMuted }]}>
                <Activity size={18} color={theme.accent} />
              </View>
              <ThemedText type="default" style={{ fontWeight: '700', flex: 1 }}>
                Device Live Speed Probe
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Samples getDeviceCounters() every 1s for 30s as MB/s.
            </ThemedText>

            <Button
              variant={deviceProbeRunning ? 'outline' : 'secondary'}
              icon={<Play size={14} color={theme.text} />}
              title={deviceProbeRunning ? 'Running (30s)...' : 'Run device speed probe'}
              onPress={runDeviceProbe}
              disabled={deviceProbeRunning}
            />

            {deviceSamples.length > 0 && (
              <View style={[styles.logPanel, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                {deviceSamples.map((s, i) => (
                  <ThemedText key={i} type="code">
                    {s.time} ·{' '}
                    {s.unsupported
                      ? 'UNSUPPORTED (negative counter)'
                      : `mRx ${s.mbpsMobileRx.toFixed(2)} · mTx ${s.mbpsMobileTx.toFixed(2)} · tRx ${s.mbpsTotalRx.toFixed(2)} · tTx ${s.mbpsTotalTx.toFixed(2)}`}
                  </ThemedText>
                ))}
              </View>
            )}
          </Card>

          {/* Per-App Live Feasibility Probe */}
          <Card style={styles.card}>
            <View style={styles.headerRow}>
              <View style={[styles.iconBox, { backgroundColor: theme.accentMuted }]}>
                <Layers size={18} color={theme.accent} />
              </View>
              <ThemedText type="default" style={{ fontWeight: '700', flex: 1 }}>
                Per-App Live Probe
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Queries trailing 10s window every 2s for 60s.
            </ThemedText>

            <Button
              variant={appProbeRunning ? 'outline' : 'secondary'}
              icon={<Play size={14} color={theme.text} />}
              title={appProbeRunning ? 'Running (60s)...' : 'Run per-app live probe'}
              onPress={runAppLiveProbe}
              disabled={appProbeRunning}
            />

            {appProbeSamples.length > 0 && (
              <View style={[styles.logPanel, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                {appProbeSamples.map((s, i) => (
                  <ThemedText key={i} type="code">
                    {s.time} · rows {s.rowCount} ·{' '}
                    {s.changed.length > 0 ? s.changed.join(', ') : '(none)'}
                  </ThemedText>
                ))}
              </View>
            )}
          </Card>

          {/* Notification & Alert Tests */}
          <Card style={styles.card}>
            <View style={styles.headerRow}>
              <View style={[styles.iconBox, { backgroundColor: theme.accentMuted }]}>
                <Bell size={18} color={theme.accent} />
              </View>
              <ThemedText type="default" style={{ fontWeight: '700', flex: 1 }}>
                Notification & Alert Tests
              </ThemedText>
            </View>

            <View style={{ gap: Spacing.two }}>
              <Button
                variant="outline"
                icon={<Bell size={15} color={theme.text} />}
                title="Send Test Notification"
                onPress={async () => {
                  setNotificationStatus('Requesting permissions and sending test notification...');
                  try {
                    const ok = await ensureNotificationSetup();
                    if (!ok) {
                      setNotificationStatus('Permission DENIED by user.');
                      return;
                    }
                    await notify(
                      'Test Alert Title',
                      'This is a direct test notification from Network Tracker.'
                    );
                    setNotificationStatus('Direct notification delivered!');
                  } catch (e) {
                    setNotificationStatus(`Error: ${String(e)}`);
                  }
                }}
              />

              <Button
                variant="outline"
                icon={<Play size={15} color={theme.text} />}
                title="Run Usage Check (runUsageCheck)"
                onPress={async () => {
                  setNotificationStatus('Running runUsageCheck(Date.now())...');
                  try {
                    const result = await runUsageCheck(Date.now());
                    const settings = await loadSettings();
                    setNotificationStatus(
                      `Result: "${result}" (alerted keys: ${settings.alertedKeys.join(', ') || 'none'})`
                    );
                  } catch (e) {
                    setNotificationStatus(`Error: ${String(e)}`);
                  }
                }}
              />

              <Button
                variant="outline"
                icon={<RotateCcw size={15} color={theme.text} />}
                title="Reset alerted keys"
                onPress={async () => {
                  await saveSettings({ alertedKeys: [] });
                  setNotificationStatus('Alerted keys cleared!');
                }}
              />
            </View>

            {notificationStatus && (
              <View style={[styles.statusBox, { backgroundColor: theme.accentMuted, borderColor: theme.accent + '44' }]}>
                <ThemedText type="smallBold" themeColor="accent">
                  {notificationStatus}
                </ThemedText>
              </View>
            )}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  logPanel: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.one,
  },
  statusBox: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
});
