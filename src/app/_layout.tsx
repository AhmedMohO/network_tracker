import { reloadAppAsync } from 'expo';
import * as Linking from 'expo-linking';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Alert, AppState, Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { parsePairLink } from '@/features/family/pair';
import { registerPushToken } from '@/features/family/pushToken';
import { backfillFromChild, syncFromChild } from '@/features/family/sync';
import { joinAsChild } from '@/features/family/useFamily';
// Importing this at module scope registers the TaskManager task on load.
import { registerBackgroundCheck } from '@/features/limits/backgroundCheck';
import { ensureNotificationSetup } from '@/features/limits/notify';
import { applyOtaUpdate, checkForOtaUpdate } from '@/features/updates/ota';
import { PermissionGate } from '@/features/usage/PermissionGate';
import { runFirstTimeSetup } from '@/features/usage/firstRun';
import { loadSettings } from '@/features/usage/settings';
import { UsageProvider } from '@/features/usage/useUsageContext';
import i18n, { syncLayoutDirection } from '@/i18n';

SplashScreen.preventAutoHideAsync();

/** Shortest gap between two foreground-triggered child pushes. */
const FOREGROUND_SYNC_INTERVAL = 5 * 60_000;

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Android only applies a layout-direction flip to a freshly started bundle,
  // so a device whose locale disagrees with the stored language reloads once.
  useEffect(() => {
    if (syncLayoutDirection(i18n.language)) reloadAppAsync();
  }, []);

  // Notifications and background tasks have no meaningful web implementation.
  //
  // Registered unconditionally, *not* behind the notification permission:
  // `USAGE_CHECK_TASK` is also the only thing that pushes a child's usage and
  // pulls a parent's. Gating it on notifications meant a child that declined
  // the permission prompt never synced at all, and the only way to move data
  // was the debug "Run Usage Check" button. The permission is still requested
  // — a granted one is what lets the alerts inside the task actually post.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    registerBackgroundCheck().catch(() => {});
    // Sequenced, not fired in parallel: a push token is only issued once the
    // notification permission is granted, and `ensureNotificationSetup` is
    // what asks. Running them side by side meant the very first launch — the
    // one where the user says yes — always missed the token and waited for
    // the next app start to register.
    ensureNotificationSetup()
      .then(() => registerPushToken())
      .catch((e) => { console.warn('[family] push registration failed:', e); });
  }, []);

  // Android's background task is a floor of 15 minutes and a promise of
  // nothing: WorkManager defers it under Doze, and an OEM battery manager can
  // withhold it for hours. Coming back to the foreground is the one moment
  // this app knows it has CPU, so a paired child pushes then too. Both calls
  // no-op unless this device is a paired child / has history left to send.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let lastPushAt = 0;
    const push = () => {
      const now = Date.now();
      // The push is ~6 native queries and 2 POSTs; app-switching should not
      // re-run it every few seconds.
      if (now - lastPushAt < FOREGROUND_SYNC_INTERVAL) return;
      lastPushAt = now;
      syncFromChild(now).catch((e) => { console.warn('[family] foreground syncFromChild failed:', e); });
      backfillFromChild(now).catch((e) => { console.warn('[family] foreground backfillFromChild failed:', e); });
    };
    // Rides the same listener rather than adding a second one. It has to be
    // retried on every foreground, not just at startup: on a fresh install
    // usage access is still ungranted at this point, and `runFirstTimeSetup`
    // returns without stamping until it is — the pass that runs the setup is
    // the one right after the user comes back from the settings screen. Its
    // own stamp makes every later call a single settings read. Unthrottled,
    // unlike `push`, because it is that read and nothing else once done.
    const setUp = () => {
      runFirstTimeSetup().catch((e) => { console.warn('[setup] first run failed:', e); });
    };
    push();
    setUp();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      push();
      setUp();
    });
    return () => sub.remove();
  }, []);

  // A downloaded bundle is applied by a reload, and a reload mid-session throws
  // away whatever the user was looking at — so it is offered, never forced.
  useEffect(() => {
    checkForOtaUpdate().then((result) => {
      if (result !== 'downloaded') return;
      Alert.alert(i18n.t('update.readyTitle'), i18n.t('update.readyBody'), [
        { text: i18n.t('update.later'), style: 'cancel' },
        { text: i18n.t('update.restart'), onPress: () => applyOtaUpdate() },
      ]);
    });
  }, []);

  // Covers both a cold start via the link and the app already running. This
  // sits above `UsageProvider`, so it cannot use `useFamily` — it goes
  // through the plain `joinAsChild` export instead, and reloads the app
  // afterwards so every screen (in particular the child's disclosure banner)
  // picks up the new pairing immediately rather than on next restart.
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    const pairing = parsePairLink(url);
    if (!pairing) return;
    loadSettings()
      .then((s) => {
        // Already paired with this exact link: no prompt, not even a no-op one.
        if (s.pairToken === pairing.token) return;
        // Never pair silently: a link can arrive from anyone, and the whole point
        // of this feature is that the person being monitored knows about it.
        Alert.alert(
          i18n.t('family.joinTitle'),
          i18n.t('family.joinBody', { label: pairing.label }),
          [
            { text: i18n.t('common.cancel'), style: 'cancel' },
            {
              text: i18n.t('family.join'),
              onPress: () => {
                // `joinAsChild` throws (rather than switching) when this
                // device is already paired with a *different* token — that
                // refusal, and any other join failure, must reach the user
                // rather than leaving them staring at a dismissed dialog on
                // a still-unpaired device.
                joinAsChild(pairing.token, pairing.label)
                  .then(() => syncFromChild(Date.now()).catch((e) => { console.warn('[family] deep-link syncFromChild failed:', e); }))
                  // No backfill here: `reloadAppAsync` below tears the JS
                  // context down, and starting a minutes-long loop on the
                  // line before that only ever got one or two days pushed.
                  // The foreground effect above picks it up after the reload,
                  // resuming from `backfillDoneUntil`.
                  .then(() => reloadAppAsync())
                  .catch((e) => {
                    Alert.alert(
                      i18n.t('family.joinFailedTitle'),
                      e instanceof Error ? e.message : i18n.t('family.joinFailedBody')
                    );
                  });
              },
            },
          ]
        );
      })
      .catch((e) => {
        console.warn('[family] deep-link settings load failed:', e);
        // prompt simply doesn't appear for this link.
      });
  }, [url]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <UsageProvider>
        <PermissionGate>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </PermissionGate>
      </UsageProvider>
    </ThemeProvider>
  );
}
