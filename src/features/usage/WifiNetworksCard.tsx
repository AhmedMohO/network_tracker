import { HelpCircle, Router, Wifi } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { formatBytes } from './format';
import { sliceApp, type WifiNetworkSlice } from './wifiSlices';

/** A share this small still gets a visible sliver, matching `AppRow`. */
const MIN_VISIBLE_PERCENT = 1;

function NetworkRow({
  ssid,
  bytes,
  percent,
}: {
  ssid: string | null;
  bytes: number;
  percent: number;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  // The unattributed bucket is a different kind of thing from a network, so it
  // gets a different icon and the muted colour rather than pretending to be
  // one more row in the list.
  const unknown = ssid === null;
  const label = unknown ? t('wifiNetworks.unknown') : ssid;
  const Icon = unknown ? HelpCircle : Router;
  const tint = unknown ? theme.textSecondary : theme.accent;

  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={t('wifiNetworks.rowA11y', {
        name: label,
        bytes: formatBytes(bytes),
        percent: Math.round(percent),
      })}>
      <View style={[styles.iconBox, { backgroundColor: theme.backgroundSelected }]}>
        <Icon size={16} color={tint} />
      </View>
      <View style={styles.body}>
        <View style={styles.line}>
          <ThemedText
            type="default"
            numberOfLines={1}
            themeColor={unknown ? 'textSecondary' : 'text'}
            style={styles.name}>
            {label}
          </ThemedText>
          <ThemedText type="default" style={styles.bytes}>
            {formatBytes(bytes)}
          </ThemedText>
        </View>
        <Progress
          value={percent <= 0 ? 0 : Math.max(percent, MIN_VISIBLE_PERCENT)}
          indicatorColor={tint}
          height={6}
        />
      </View>
    </View>
  );
}

/**
 * Wi-Fi usage broken out by the network it happened on.
 *
 * Renders nothing when the only row would be the unattributed bucket — a card
 * whose single line reads "Unrecorded network" repeats the totals card above
 * it and tells the user nothing they cannot already see.
 *
 * One *named* network does render, even though it is also a single row:
 * "all of it on Ahmed Moh" is an answer to the question this card asks, and
 * hiding it is indistinguishable from the feature being broken — which is
 * exactly how the empty-log bug in `WifiWatchService.onStartCommand` stayed
 * invisible.
 */
export function WifiNetworksCard({
  networks,
  title,
}: {
  networks: WifiNetworkSlice[];
  /** The detail screen names one app; the dashboard uses the default. */
  title?: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();

  const used = networks.filter((n) => n.totals.total > 0);
  if (used.length === 0) return null;
  if (used.length === 1 && used[0].ssid === null) return null;

  const grandTotal = used.reduce((sum, n) => sum + n.totals.total, 0);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.headerIconBox, { backgroundColor: theme.accentMuted }]}>
          <Wifi size={16} color={theme.accent} />
        </View>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {title ?? t('wifiNetworks.title')}
        </ThemedText>
      </View>

      <View style={styles.rows}>
        {used.map((n) => (
          <NetworkRow
            // Prefixed so a network genuinely named "unattributed" cannot
            // collide with the bucket that has no name at all.
            key={n.ssid === null ? 'unattributed' : `ssid:${n.ssid}`}
            ssid={n.ssid}
            bytes={n.totals.total}
            percent={grandTotal === 0 ? 0 : (n.totals.total / grandTotal) * 100}
          />
        ))}
      </View>
    </Card>
  );
}

/**
 * The same breakdown for a single app, which has bytes but no `AppUsage[]` of
 * its own to hand to `WifiNetworksCard`.
 */
export function AppWifiNetworks({
  networks,
  uid,
  appName,
}: {
  networks: WifiNetworkSlice[];
  uid: number;
  appName: string;
}) {
  const { t } = useTranslation();
  return (
    <WifiNetworksCard
      networks={sliceApp(networks, uid)}
      title={t('wifiNetworks.appTitle', { name: appName })}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rows: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
  bytes: {
    fontVariant: ['tabular-nums'],
  },
});
