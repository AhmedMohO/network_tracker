import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { useLimitStatus } from '@/features/limits/useLimitStatus';
import { formatBytes } from '@/features/usage/format';
import { saveSettings } from '@/features/usage/settings';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/i18n/format';

import { suggestAskedBytes } from './request';
import { pushSnapshot } from './sync';

/**
 * The child's "ask for more data" control. Visible only on a paired child
 * device, and only once its own local mobile alert has actually crossed warn
 * or over — asking is not offered while nothing is wrong — or while a
 * request already sent is still awaiting an answer.
 *
 * `mobileLimitBytes` only, never Wi-Fi: it is the field a `grant` raises
 * (`features/family/request.ts`'s `applyGrant`), the same one
 * `useLimitStatus('MOBILE')` reads, and the same mobile-only convention the
 * parent's own per-child notification threshold already uses.
 *
 * Review Finding M-9: `useLimitStatus` below still runs on every render this
 * component gets — Rules of Hooks forbids calling it only after a role
 * check — so the actual fix is at the call site: `(tabs)/index.tsx` mounts
 * `<RequestCard />` at all only for `familyRole === 'child'`, using the role
 * it already has, so a parent/unpaired install never renders this component
 * (and never runs this hook) in the first place. The guard just below stays
 * as a cheap defensive backstop, not the real fix.
 */
export function RequestCard() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { settings, reloadSettings } = useUsageContext();
  const limitView = useLimitStatus('MOBILE');
  const [busy, setBusy] = useState(false);

  if (!settings || settings.familyRole !== 'child' || !settings.pairToken) return null;

  const pending = settings.pendingLimitRequest;
  const eligible = !!limitView && limitView.status.state !== 'ok';
  if (!pending && !eligible) return null;

  const askedBytes = pending?.askedBytes ?? (limitView ? suggestAskedBytes(limitView.status) : 0);
  const label = settings.pairedLabel ?? '';

  const requestMore = async () => {
    setBusy(true);
    try {
      const at = Date.now();
      await pushSnapshot('request', 0, { askedBytes, at });
      await saveSettings({ pendingLimitRequest: { askedBytes, at } });
      reloadSettings();
      toast(t('family.requestSentToast'));
    } catch {
      toast(t('family.requestFailedToast'));
    } finally {
      setBusy(false);
    }
  };

  // Review Finding I-3, item a (Phase 11 fix wave 2): a way out that doesn't
  // wait for the (multi-day) TTL `syncFromChild` enforces on its own.
  // Pushes `{ askedBytes: 0, at }` — the same `request` kind, upserted over
  // the outstanding row exactly like a real ask, but a zero the parent side
  // now treats as "nothing outstanding" (`[deviceId].tsx`'s `pendingRequest`,
  // `backgroundCheck.ts`'s request block) — mirroring how a `grant` already
  // uses `grantedBytes: 0` for a decline rather than a fifth `SnapshotKind`.
  // A purely local clear (the original version of this fix) left the
  // server's `request` row looking exactly like a real, still-outstanding
  // ask: the parent kept an actionable Grant/Decline card, and the
  // background check kept notifying, for a request this device had already
  // abandoned — a real, user-visible confusion the review named, not just a
  // theoretical one.
  const cancelRequest = async () => {
    setBusy(true);
    try {
      await pushSnapshot("request", 0, { askedBytes: 0, at: Date.now() });
      await saveSettings({ pendingLimitRequest: null });
      reloadSettings();
    } catch {
      // The way out must not depend on the network. Clear locally anyway so
      // the child is never stuck behind a failed push, and say plainly that
      // the parent may still see the ask until this device next reaches the
      // server — the outstanding row is only cleared by the push above.
      await saveSettings({ pendingLimitRequest: null });
      reloadSettings();
      toast(t('family.requestCancelOfflineToast'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: theme.accentMuted }]}>
          <Send size={16} color={theme.accent} />
        </View>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('family.requestHeading')}
        </ThemedText>
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {t('family.requestHint', { label })}
      </ThemedText>

      {pending ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('family.requestPending', {
              label,
              bytes: formatBytes(pending.askedBytes),
              when: formatDateTime(pending.at),
            })}
          </ThemedText>
          <Button
            variant="ghost"
            size="sm"
            title={t('family.requestCancelButton')}
            onPress={cancelRequest}
            disabled={busy}
            accessibilityLabel={t('family.requestCancelButton')}
          />
        </>
      ) : (
        <Button
          variant="default"
          title={t('family.requestButton', { label, bytes: formatBytes(askedBytes) })}
          onPress={requestMore}
          loading={busy}
          disabled={busy}
          accessibilityLabel={t('family.requestButton', { label, bytes: formatBytes(askedBytes) })}
        />
      )}
    </Card>
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
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
